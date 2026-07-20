import {
  type AuthService,
  isGrantCompatible,
  providerIdForAuth,
} from '@ctxindex/core/auth'
import {
  CtxindexAuthError,
  CtxindexNotFoundError,
  CtxindexSyncError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import type { RealmService } from '@ctxindex/core/realm'
import {
  describeRegistry,
  type ExtensionRegistry,
} from '@ctxindex/core/registry'
import type { SearchPlanner } from '@ctxindex/core/search'
import type {
  SourceResourceResult,
  SourceService,
  StatusRow,
} from '@ctxindex/core/source'
import type {
  RunSyncResult,
  SourceSyncResult,
  SyncApplicationService,
  SyncWarning,
} from '@ctxindex/core/sync'
import type { ThreadResult, ThreadService } from '@ctxindex/core/thread'
import type {
  DaemonRpcApplication,
  RpcFailure,
  RpcHealthInput,
  RpcHealthResult,
  RpcJsonCursor,
  RpcProtocolIdentity,
  RpcRealmAddInput,
  RpcRealmAddResult,
  RpcRealmListInput,
  RpcRealmListResult,
  RpcRequestContext,
  RpcResourceGetInput,
  RpcResourceGetResult,
  RpcResult,
  RpcRuntimeIdentity,
  RpcSearchInput,
  RpcSearchResult,
  RpcShutdownAccepted,
  RpcShutdownInput,
  RpcSourceAddInput,
  RpcSourceAddResult,
  RpcSourceDefinitionsInput,
  RpcSourceDefinitionsResult,
  RpcSourceListInput,
  RpcSourceListResult,
  RpcSourceRemoveInput,
  RpcSourceRemoveResult,
  RpcSourceRow,
  RpcSourceSyncResult,
  RpcStatusInput,
  RpcStatusResult,
  RpcSyncInput,
  RpcSyncResult,
  RpcThreadGetInput,
  RpcThreadGetResult,
  RpcWarning,
} from '@ctxindex/rpc'
import {
  rpcJsonCursorSchema,
  rpcJsonDefaultSchema,
  rpcResourceGetResultSchema,
  rpcSafeJsonSchema,
  rpcSearchResultSchema,
  rpcThreadGetResultSchema,
} from '@ctxindex/rpc'

export interface DaemonApplicationOptions {
  readonly protocol: RpcProtocolIdentity
  readonly runtime: RpcRuntimeIdentity
  readonly daemonVersion: string
  readonly buildVersion: string
  readonly instanceId: string
  readonly startedAt: string
  readonly pid: number
  readonly extensionDiagnosticsCount: number
  readonly observationTimeoutMs: number
  readonly authService?: Pick<AuthService, 'listGrants'>
  readonly realmService?: Pick<RealmService, 'createRealm' | 'listRealms'>
  readonly registry?: ExtensionRegistry
  readonly searchService?: Pick<SearchPlanner, 'search'>
  readonly resourceService?: {
    get(input: {
      readonly ref: string
      readonly signal: AbortSignal
    }): Promise<SourceResourceResult>
  }
  readonly threadService?: Pick<ThreadService, 'get'>
  readonly syncService: Pick<SyncApplicationService, 'run'>
  readonly sourceService: Pick<SourceService, 'resolveSourceId' | 'getStatus'> &
    Partial<Pick<SourceService, 'addSource' | 'listSources' | 'removeSource'>>
  readonly onStopping?: () => void
}

interface ActiveRequest {
  readonly controller: AbortController
  readonly settled: Promise<void>
}

class ResultTooLargeError extends Error {}

function failure(error: unknown): RpcFailure {
  if (error instanceof ResultTooLargeError) {
    return {
      kind: 'result_too_large',
      code: 'result_too_large',
      message: 'The daemon result exceeds the local protocol bounds.',
    }
  }
  if (error instanceof CtxindexAuthError) {
    return {
      kind: 'ctxindex',
      taxonomy: 'auth',
      code: error.code,
      message: 'The daemon could not complete the request.',
    }
  }
  if (error instanceof CtxindexSyncError) {
    const retryAfterMs = error.retryAfterMs
    return {
      kind: 'ctxindex',
      taxonomy: 'sync',
      code: error.code,
      message: 'The daemon could not complete the request.',
      ...(retryAfterMs !== undefined &&
      Number.isSafeInteger(retryAfterMs) &&
      retryAfterMs >= 0 &&
      retryAfterMs <= 60_000
        ? { retryAfterMs }
        : {}),
    }
  }
  if (error instanceof CtxindexValidationError) {
    return {
      kind: 'ctxindex',
      taxonomy: 'validation',
      code: error.code,
      message: error.message,
    }
  }
  if (error instanceof CtxindexNotFoundError) {
    return {
      kind: 'ctxindex',
      taxonomy: 'lookup',
      code: error.code,
      message: error.message,
    }
  }
  return {
    kind: 'ctxindex',
    taxonomy: 'other',
    code: 'internal_error',
    message: 'The daemon could not complete the request.',
  }
}

async function resolveSourceGrant(
  authService: Pick<AuthService, 'listGrants'>,
  adapter: NonNullable<ReturnType<ExtensionRegistry['adapters']['get']>>,
  account?: string,
): Promise<string | undefined> {
  const provider = adapter.provider
  if (provider === undefined || provider.auth.kind === 'none') return undefined
  if (provider.auth.kind !== 'oauth2') {
    throw new CtxindexValidationError(
      'invalid_filter',
      'Adapter authentication is not supported by this command',
    )
  }
  const providerId = providerIdForAuth(adapter)
  const providerGrants = await authService.listGrants(providerId ?? undefined)
  let grants = providerGrants
  if (account) {
    const byLabel = providerGrants.filter(
      (grant) => grant.accountLabel === account,
    )
    const byAccountId = providerGrants.filter(
      (grant) => grant.accountId === account,
    )
    const byGrantId = providerGrants.filter((grant) => grant.id === account)
    grants =
      byLabel.length > 0
        ? byLabel
        : byAccountId.length > 0
          ? byAccountId
          : byGrantId
  }
  const matches = grants.filter((grant) => isGrantCompatible(adapter, grant))
  if (matches.length === 0) {
    throw new CtxindexValidationError(
      'invalid_filter',
      account
        ? `no compatible Grant matches account "${account}"`
        : `no compatible Grant available; run bun cli account add ${providerId ?? '<provider>'}`,
    )
  }
  if (matches.length > 1) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `multiple compatible Grants available; choose one with --account <label|account-id|grant-id>: ${matches.map((grant) => grant.accountLabel ?? grant.accountId).join(', ')}`,
    )
  }
  return matches[0]?.id
}

function unavailable(): RpcResult<never> {
  return {
    ok: false,
    error: {
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message: 'The daemon is stopping and is not accepting new work.',
    },
  }
}

function publicCode(value: unknown): string {
  return typeof value === 'string' ? value : 'unknown'
}

function safeSearchWarning(value: RpcSearchResult['warnings'][number]) {
  const code = /^[a-z0-9_.-]{1,64}$/i.test(value.code)
    ? value.code
    : 'provider_failure'
  return {
    sourceId: value.sourceId,
    code,
    message: `Search warning for Source "${value.sourceId}" (${code})`,
  }
}

function warning(value: SyncWarning | null): RpcWarning | null {
  if (value === null) return null
  return {
    code: value.code,
    message: value.message,
    ...(value.ref === undefined ? {} : { ref: value.ref }),
  }
}

function presentWarning(value: SyncWarning): RpcWarning {
  return warning(value) as RpcWarning
}

function syncSourceResult(value: SourceSyncResult): RpcSourceSyncResult {
  if (value.status === 'completed') {
    return {
      sourceId: value.sourceId,
      status: 'completed',
      run: {
        ...value.run,
        lastWarning: warning(value.run.lastWarning),
        warnings: value.run.warnings.map(presentWarning),
      },
    }
  }
  const code = publicCode(value.error.code)
  const message = `Sync failed for Source "${value.sourceId}" (${code})`
  return {
    sourceId: value.sourceId,
    status: 'failed',
    failure: { code, message },
    diagnostics: {
      warningsCount: value.diagnostics.warningsCount,
      lastWarning: warning(value.diagnostics.lastWarning),
      errorsCount: 1,
      lastError: message,
    },
  }
}

function syncResult(value: RunSyncResult): RpcSyncResult {
  return {
    mode: value.mode,
    results: value.results.map(syncSourceResult),
    warnings: value.warnings.map((entry) => ({
      sourceId: entry.sourceId,
      ...presentWarning(entry),
    })),
  }
}

function statusRow(value: StatusRow): RpcStatusResult['rows'][number] {
  return {
    sourceId: value.sourceId,
    adapterId: value.adapterId,
    realmSlug: value.realmSlug,
    availability: value.availability,
    lastStatus: value.lastStatus,
    lastRunAt: value.lastRunAt,
    warningsCount: value.warningsCount,
    lastWarning: warning(value.lastWarning),
    errorsCount: value.errorsCount,
    lastError: value.lastError,
    cursor: rpcJsonCursorSchema.parse(value.cursor) as RpcJsonCursor,
  }
}

function sourceRow(
  value: ReturnType<NonNullable<SourceService['listSources']>>[number],
): RpcSourceRow {
  return {
    id: value.id,
    realm_id: value.realm_id,
    ...(value.realm_slug === undefined ? {} : { realm_slug: value.realm_slug }),
    adapter_id: value.adapter_id,
    label: value.label,
    config_json: value.config_json,
    sync_enabled: value.sync_enabled,
    ...(value.search_routing === undefined
      ? {}
      : { search_routing: value.search_routing }),
    ...(value.grant_id === undefined ? {} : { grant_id: value.grant_id }),
    created_at: value.created_at,
    availability: value.availability,
    ...(value.last_status === undefined
      ? {}
      : { last_status: value.last_status }),
    ...(value.last_run_at === undefined
      ? {}
      : { last_run_at: value.last_run_at }),
    ...(value.warnings_count === undefined
      ? {}
      : { warnings_count: value.warnings_count }),
    ...(value.last_warning === undefined
      ? {}
      : { last_warning: value.last_warning }),
    ...(value.errors_count === undefined
      ? {}
      : { errors_count: value.errors_count }),
    ...(value.last_error === undefined ? {} : { last_error: value.last_error }),
    ...(value.items_count === undefined
      ? {}
      : { items_count: value.items_count }),
    ...(value.chunks_count === undefined
      ? {}
      : { chunks_count: value.chunks_count }),
    ...(value.sample_uri === undefined ? {} : { sample_uri: value.sample_uri }),
    ...(value.account_email === undefined
      ? {}
      : { account_email: value.account_email }),
  }
}

function presentResource(
  value:
    | SourceResourceResult['resource']
    | ThreadResult['messages'][number]['resource'],
) {
  return {
    ...('id' in value ? { id: value.id } : {}),
    ref: value.ref,
    sourceId: value.sourceId,
    realmId: value.realmId,
    profile: value.profile,
    origin: value.origin,
    title: value.title,
    summary: value.summary,
    occurredAt: value.occurredAt,
    providerUpdatedAt: value.providerUpdatedAt,
    deletedAt: value.deletedAt,
    hydratedAt: value.hydratedAt,
    payload: (() => {
      if (value.payload === null) return null
      const parsed = rpcSafeJsonSchema.safeParse(value.payload)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })(),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function presentThreadNode(
  value: ThreadResult['messages'][number],
): RpcThreadGetResult['messages'][number] {
  return {
    resource: presentResource(value.resource),
    children: value.children.map(presentThreadNode),
  }
}

export class DaemonApplication implements DaemonRpcApplication {
  readonly #active = new Map<string, ActiveRequest>()
  readonly #options: DaemonApplicationOptions
  #lifecycle: RpcHealthResult['lifecycle'] = 'starting'
  #requestSequence = 0
  #stoppingNotified = false

  readonly system: DaemonRpcApplication['system'] = {
    health: (input, context) => this.health(input, context),
    shutdown: (input, context) => this.shutdown(input, context),
  }
  readonly realm: DaemonRpcApplication['realm'] = {
    add: (input, context) => this.realmAdd(input, context),
    list: (input, context) => this.realmList(input, context),
  }
  readonly source: DaemonRpcApplication['source'] = {
    definitions: (input, context) => this.sourceDefinitions(input, context),
    add: (input, context) => this.sourceAdd(input, context),
    list: (input, context) => this.sourceList(input, context),
    remove: (input, context) => this.sourceRemove(input, context),
  }
  readonly sync: DaemonRpcApplication['sync'] = {
    run: (input, context) => this.runSync(input, context),
  }
  readonly status: DaemonRpcApplication['status'] = {
    get: (input, context) => this.getStatus(input, context),
  }
  readonly search: DaemonRpcApplication['search'] = {
    query: (input, context) => this.querySearch(input, context),
  }
  readonly resource: DaemonRpcApplication['resource'] = {
    get: (input, context) => this.getResource(input, context),
  }
  readonly thread: DaemonRpcApplication['thread'] = {
    get: (input, context) => this.getThread(input, context),
  }

  constructor(options: DaemonApplicationOptions) {
    this.#options = options
  }

  get activeRequestCount(): number {
    return this.#active.size
  }

  get lifecycle(): RpcHealthResult['lifecycle'] {
    return this.#lifecycle
  }

  markReady(): void {
    if (this.#lifecycle !== 'starting')
      throw new Error('Daemon cannot become ready')
    this.#lifecycle = 'ready'
  }

  beginStopping(): boolean {
    const alreadyStopping = this.#lifecycle === 'stopping'
    this.#lifecycle = 'stopping'
    for (const request of this.#active.values()) request.controller.abort()
    if (!this.#stoppingNotified) {
      this.#stoppingNotified = true
      this.#options.onStopping?.()
    }
    return alreadyStopping
  }

  async whenDrained(): Promise<void> {
    while (this.#active.size > 0) {
      await Promise.all(
        [...this.#active.values()].map((entry) => entry.settled),
      )
    }
  }

  async health(
    _input: RpcHealthInput,
    _context: RpcRequestContext,
  ): Promise<RpcResult<RpcHealthResult>> {
    return {
      ok: true,
      value: {
        protocol: this.#options.protocol,
        runtime: this.#options.runtime,
        daemonVersion: this.#options.daemonVersion,
        buildVersion: this.#options.buildVersion,
        instanceId: this.#options.instanceId,
        pid: this.#options.pid,
        startedAt: this.#options.startedAt,
        lifecycle: this.#lifecycle,
        ready: this.#lifecycle === 'ready',
        extensionDiagnosticsCount: this.#options.extensionDiagnosticsCount,
        activeRequestCount: this.#active.size,
      },
    }
  }

  runSync(
    input: RpcSyncInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSyncResult>> {
    return this.#business(context, async (signal) =>
      syncResult(
        await this.#options.syncService.run({
          ...(input.source ? { source: input.source } : {}),
          mode: input.mode,
          signal,
        }),
      ),
    )
  }

  realmAdd(
    input: RpcRealmAddInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcRealmAddResult>> {
    return this.#business(context, async (signal) => {
      if (!this.#options.realmService) throw new Error('Realm service missing')
      signal.throwIfAborted()
      return this.#options.realmService.createRealm({
        slug: input.slug,
        ...(input.displayName !== undefined
          ? { displayName: input.displayName }
          : {}),
      })
    })
  }

  realmList(
    _input: RpcRealmListInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcRealmListResult>> {
    return this.#business(context, async () => {
      if (!this.#options.realmService) throw new Error('Realm service missing')
      return { rows: this.#options.realmService.listRealms() }
    })
  }

  sourceAdd(
    input: RpcSourceAddInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceAddResult>> {
    return this.#business(context, async (signal) => {
      if (!this.#options.registry) throw new Error('Registry missing')
      if (!this.#options.authService) throw new Error('Auth service missing')
      if (!this.#options.sourceService.addSource)
        throw new Error('Source add service missing')
      const adapter = this.#options.registry.adapters.get({
        id: input.adapterId,
      })
      if (!adapter) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `Unknown adapter: ${input.adapterId}`,
        )
      }
      let config: unknown
      try {
        config = JSON.parse(input.configJson ?? '{}')
      } catch {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}`,
        )
      }
      const validatedConfig = adapter.configSchema.safeParse(config)
      if (!validatedConfig.success) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}`,
        )
      }
      const grantId = await resolveSourceGrant(
        this.#options.authService,
        adapter,
        input.account,
      )
      signal.throwIfAborted()
      return this.#options.sourceService.addSource({
        adapterId: input.adapterId,
        ...(input.realmSlug ? { realmSlug: input.realmSlug } : {}),
        ...(input.label ? { label: input.label } : {}),
        configJson: JSON.stringify(validatedConfig.data),
        ...(grantId ? { grantId } : {}),
        ...(input.searchRouting ? { searchRouting: input.searchRouting } : {}),
        ...(input.syncEnabled !== undefined
          ? { syncEnabled: input.syncEnabled }
          : {}),
      })
    })
  }

  sourceDefinitions(
    _input: RpcSourceDefinitionsInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceDefinitionsResult>> {
    return this.#business(context, async () => {
      if (!this.#options.registry) throw new Error('Registry missing')
      return {
        rows: describeRegistry(this.#options.registry).sources.map(
          (source) => ({
            id: source.id,
            configOptions: source.configOptions.map((option) => ({
              property: option.property,
              flag: option.flag,
              type: option.type,
              required: option.required,
              ...(option.default === undefined
                ? {}
                : { default: rpcJsonDefaultSchema.parse(option.default) }),
            })),
          }),
        ),
      }
    })
  }

  sourceList(
    input: RpcSourceListInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceListResult>> {
    return this.#business(context, async () => {
      if (!this.#options.sourceService.listSources)
        throw new Error('Source list service missing')
      return {
        rows: this.#options.sourceService
          .listSources(input.realmSlug ? { realmSlug: input.realmSlug } : {})
          .map(sourceRow),
      }
    })
  }

  sourceRemove(
    input: RpcSourceRemoveInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSourceRemoveResult>> {
    return this.#business(context, async (signal) => {
      const sourceId = this.#options.sourceService.resolveSourceId(input.source)
      if (!this.#options.sourceService.removeSource)
        throw new Error('Source remove service missing')
      signal.throwIfAborted()
      this.#options.sourceService.removeSource(sourceId)
      return { sourceId }
    })
  }

  querySearch(
    input: RpcSearchInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcSearchResult>> {
    return this.#business(context, async (signal) => {
      if (!this.#options.searchService)
        throw new Error('Search service missing')
      const sourceIds = input.sourceIds?.map((source) =>
        this.#options.sourceService.resolveSourceId(source),
      )
      const result = await this.#options.searchService.search({
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.realms !== undefined ? { realms: input.realms } : {}),
        ...(sourceIds !== undefined ? { sourceIds } : {}),
        ...(input.adapterId !== undefined
          ? { adapterId: input.adapterId }
          : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.fields !== undefined ? { fields: input.fields } : {}),
        ...(input.since !== undefined ? { since: input.since } : {}),
        ...(input.until !== undefined ? { until: input.until } : {}),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
        ...(input.includeDeleted !== undefined
          ? { includeDeleted: input.includeDeleted }
          : {}),
        ...(input.localOnly !== undefined
          ? { localOnly: input.localOnly }
          : {}),
        ...(input.remote !== undefined ? { remote: input.remote } : {}),
        ...(input.explain !== undefined ? { explain: input.explain } : {}),
        signal,
      })
      const output = {
        results: result.results,
        warnings: result.warnings.map(safeSearchWarning),
        ...(result.pagination === undefined
          ? {}
          : { pagination: result.pagination }),
        ...(result.explain === undefined ? {} : { explain: result.explain }),
      }
      const parsed = rpcSearchResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  getResource(
    input: RpcResourceGetInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcResourceGetResult>> {
    return this.#business(context, async (signal) => {
      if (!this.#options.resourceService)
        throw new Error('Resource service missing')
      const result = await this.#options.resourceService.get({
        ref: input.ref,
        signal,
      })
      const output = {
        resource: presentResource(
          result.resource,
        ) as RpcResourceGetResult['resource'],
        warnings: result.warnings,
      }
      const parsed = rpcResourceGetResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  getThread(
    input: RpcThreadGetInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcThreadGetResult>> {
    return this.#business(context, async () => {
      if (!this.#options.threadService)
        throw new Error('Thread service missing')
      const result = this.#options.threadService.get(input.ref)
      const output = {
        mode: result.mode,
        messages: result.messages.map(presentThreadNode),
        warnings: result.warnings,
      }
      const parsed = rpcThreadGetResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  getStatus(
    input: RpcStatusInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcStatusResult>> {
    return this.#business(context, async () => {
      const sourceId = input.source
        ? this.#options.sourceService.resolveSourceId(input.source)
        : undefined
      return {
        rows: this.#options.sourceService
          .getStatus(sourceId ? { sourceId } : {})
          .map(statusRow),
      }
    })
  }

  async shutdown(
    _input: RpcShutdownInput,
    _context: RpcRequestContext,
  ): Promise<RpcResult<RpcShutdownAccepted>> {
    const alreadyStopping = this.beginStopping()
    return {
      ok: true,
      value: {
        status: 'accepted',
        instanceId: this.#options.instanceId,
        acceptedAt: new Date().toISOString(),
        alreadyStopping,
        observationTimeoutMs: this.#options.observationTimeoutMs,
      },
    }
  }

  #business<T>(
    context: RpcRequestContext,
    invoke: (signal: AbortSignal) => Promise<T>,
  ): Promise<RpcResult<T>> {
    if (this.#lifecycle !== 'ready') return Promise.resolve(unavailable())
    const controller = new AbortController()
    const cancel = () => controller.abort(context.signal.reason)
    if (context.signal.aborted) cancel()
    else context.signal.addEventListener('abort', cancel, { once: true })

    const key = `${context.requestId}:${this.#requestSequence++}`
    let settle!: () => void
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    this.#active.set(key, { controller, settled })

    return invoke(controller.signal)
      .then(
        (value): RpcResult<T> =>
          controller.signal.aborted
            ? {
                ok: false,
                error: {
                  kind: 'cancelled',
                  code: 'cancelled',
                  message: 'The request was cancelled.',
                },
              }
            : { ok: true, value },
      )
      .catch(
        (error): RpcResult<T> =>
          controller.signal.aborted
            ? {
                ok: false,
                error: {
                  kind: 'cancelled',
                  code: 'cancelled',
                  message: 'The request was cancelled.',
                },
              }
            : { ok: false, error: failure(error) },
      )
      .finally(() => {
        context.signal.removeEventListener('abort', cancel)
        this.#active.delete(key)
        settle()
      })
  }
}
