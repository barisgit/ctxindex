import type {
  DescribeActionResult,
  RunActionResult,
} from '@ctxindex/core/action'
import {
  type AuthService,
  isGrantCompatible,
  providerIdForAuth,
} from '@ctxindex/core/auth'
import type {
  DocumentationItem,
  DocumentationSearchResult,
  DocumentationService,
} from '@ctxindex/core/documentation'
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
  SyncApplicationEvent,
  SyncApplicationService,
  SyncWarning,
} from '@ctxindex/core/sync'
import type { ThreadResult, ThreadService } from '@ctxindex/core/thread'
import type {
  DaemonRpcApplication,
  RpcActionDescribeInput,
  RpcActionDescribeResult,
  RpcActionRunResult,
  RpcDocumentationGetInput,
  RpcDocumentationGetResult,
  RpcDocumentationListInput,
  RpcDocumentationListResult,
  RpcDocumentationRow,
  RpcDocumentationSearchInput,
  RpcDocumentationSearchResult,
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
  RpcSyncEvent,
  RpcSyncInput,
  RpcSyncResult,
  RpcThreadGetInput,
  RpcThreadGetResult,
  RpcWarning,
} from '@ctxindex/rpc'
import {
  rpcActionDescribeResultSchema,
  rpcActionRunResultSchema,
  rpcDocumentationGetResultSchema,
  rpcDocumentationListResultSchema,
  rpcDocumentationSearchResultSchema,
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
  readonly documentationService: Pick<
    DocumentationService,
    'list' | 'get' | 'search'
  >
  readonly idleTimeoutMs?: number
  readonly idleTimer?: DaemonIdleTimer
  readonly observationTimeoutMs: number
  readonly authService?: Pick<AuthService, 'listGrants'>
  readonly actionService?: DaemonActionService
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

export interface DaemonActionService {
  readonly describe: (input: {
    readonly actionId: string
    readonly sourceId: string
  }) => DescribeActionResult
  readonly run: (input: {
    readonly actionId: string
    readonly sourceId: string
    readonly actionInput: unknown
    readonly signal: AbortSignal
    readonly confirmIrreversible: boolean
  }) => Promise<RunActionResult>
}

export interface DaemonIdleTimer {
  now(): number
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

interface ActiveRequest {
  readonly controller: AbortController
  readonly settled: Promise<void>
}

interface RendezvousItem<T> {
  readonly value: T
  readonly accept: () => void
  readonly reject: (error: unknown) => void
}

class StreamRendezvous<T, TReturn> {
  #item: RendezvousItem<T> | undefined
  #terminal: TReturn | undefined
  #terminalSet = false
  #waiter: (() => void) | undefined
  #closedError: unknown

  push(value: T): Promise<void> {
    if (this.#closedError !== undefined)
      return Promise.reject(this.#closedError)
    if (this.#terminalSet) return Promise.reject(new Error('Stream settled'))
    if (this.#item) return Promise.reject(new Error('Stream buffer occupied'))
    return new Promise<void>((accept, reject) => {
      this.#item = { value, accept, reject }
      this.#wake()
    })
  }

  finish(value: TReturn): void {
    if (this.#terminalSet) return
    this.#terminal = value
    this.#terminalSet = true
    this.#wake()
  }

  close(error: unknown): void {
    this.#closedError = error
    const item = this.#item
    this.#item = undefined
    item?.reject(error)
    this.#wake()
  }

  async next(): Promise<IteratorResult<T, TReturn>> {
    while (!this.#item && !this.#terminalSet) {
      await new Promise<void>((resolve) => {
        this.#waiter = resolve
      })
    }
    const item = this.#item
    if (item) {
      this.#item = undefined
      item.accept()
      return { done: false, value: item.value }
    }
    return { done: true, value: this.#terminal as TReturn }
  }

  #wake(): void {
    const waiter = this.#waiter
    this.#waiter = undefined
    waiter?.()
  }
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

function unavailable(
  lifecycle: Exclude<RpcHealthResult['lifecycle'], 'ready'>,
): RpcResult<never> {
  return {
    ok: false,
    error: {
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message:
        lifecycle === 'starting'
          ? 'The daemon is starting and is not yet accepting work.'
          : 'The daemon is stopping and is not accepting new work.',
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

function syncEvent(value: SyncApplicationEvent): RpcSyncEvent {
  if (value.type === 'source.started' || value.type === 'source.progress') {
    return value
  }
  const result: SourceSyncResult =
    value.type === 'source.completed'
      ? {
          sourceId: value.sourceId,
          status: 'completed',
          run: value.run,
        }
      : {
          sourceId: value.sourceId,
          status: 'failed',
          error: value.error,
          diagnostics: value.diagnostics,
        }
  const projected = syncSourceResult(result)
  return projected.status === 'completed'
    ? {
        type: 'source.completed',
        sequence: value.sequence,
        sourceId: projected.sourceId,
        run: projected.run,
      }
    : {
        type: 'source.failed',
        sequence: value.sequence,
        sourceId: projected.sourceId,
        failure: projected.failure,
        diagnostics: projected.diagnostics,
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
    | ThreadResult['messages'][number]['resource']
    | RunActionResult['resource'],
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

function documentationRow(value: DocumentationItem): RpcDocumentationRow {
  if (value.origin.kind !== 'extension') throw new ResultTooLargeError()
  return {
    extensionId: value.origin.extensionId,
    path: value.path,
    kind: value.kind,
    mediaType: value.mediaType,
    byteSize: value.byteSize,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.summary === undefined ? {} : { summary: value.summary }),
  } as RpcDocumentationRow
}

function documentationItem(
  value: DocumentationItem,
): RpcDocumentationGetResult['item'] {
  const row = documentationRow(value)
  if (value.kind === 'asset') {
    return {
      ...row,
      kind: 'asset',
      mediaType: value.mediaType,
      contentBase64: Buffer.from(value.content as Uint8Array).toString(
        'base64',
      ),
    } as RpcDocumentationGetResult['item']
  }
  return {
    ...row,
    kind: value.kind,
    mediaType: value.mediaType,
    content: value.content as string,
  } as RpcDocumentationGetResult['item']
}

function documentationSearchRow(value: DocumentationSearchResult) {
  if (value.origin.kind !== 'extension') throw new ResultTooLargeError()
  return {
    extensionId: value.origin.extensionId,
    path: value.path,
    ...(value.title === undefined ? {} : { title: value.title }),
    ...(value.summary === undefined ? {} : { summary: value.summary }),
    snippet: value.snippet,
  }
}

export class DaemonApplication implements DaemonRpcApplication {
  readonly #active = new Map<string, ActiveRequest>()
  readonly #options: DaemonApplicationOptions
  #lifecycle: RpcHealthResult['lifecycle'] = 'starting'
  #idleDeadline: number | undefined
  #idleGeneration = 0
  #idleTimerHandle: unknown
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
  readonly documentation: DaemonRpcApplication['documentation'] = {
    list: (input, context) => this.documentationList(input, context),
    get: (input, context) => this.documentationGet(input, context),
    search: (input, context) => this.documentationSearch(input, context),
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
  readonly action: DaemonRpcApplication['action'] = {
    describe: (input, context) => this.describeAction(input, context),
    run: (input, context) => this.runAction(input, context),
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
    this.#touchIdle(true)
  }

  beginStopping(): boolean {
    const alreadyStopping = this.#lifecycle === 'stopping'
    this.#lifecycle = 'stopping'
    this.#clearIdleTimer()
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
  ): ReturnType<DaemonRpcApplication['sync']['run']> {
    return this.#businessStream(context, async (signal, emit) =>
      syncResult(
        await this.#options.syncService.run({
          ...(input.source ? { source: input.source } : {}),
          mode: input.mode,
          signal,
          onEvent: (event) => emit(syncEvent(event)),
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

  documentationList(
    input: RpcDocumentationListInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcDocumentationListResult>> {
    return this.#business(context, async () => {
      const output = {
        rows: this.#options.documentationService
          .list(
            input.extensionId === undefined
              ? {}
              : { extensionId: input.extensionId },
          )
          .map(documentationRow),
      }
      const parsed = rpcDocumentationListResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  documentationGet(
    input: RpcDocumentationGetInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcDocumentationGetResult>> {
    return this.#business(context, async () => {
      const output = {
        item: documentationItem(
          this.#options.documentationService.get({
            extensionId: input.extensionId,
            path: input.path,
          }),
        ),
      }
      const parsed = rpcDocumentationGetResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  documentationSearch(
    input: RpcDocumentationSearchInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcDocumentationSearchResult>> {
    return this.#business(context, async () => {
      const output = {
        rows: this.#options.documentationService
          .search({
            query: input.query,
            ...(input.extensionId === undefined
              ? {}
              : { extensionId: input.extensionId }),
          })
          .map(documentationSearchRow),
      }
      const parsed = rpcDocumentationSearchResultSchema.safeParse(output)
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
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
        ...(input.continuation !== undefined
          ? { continuation: input.continuation }
          : {}),
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

  describeAction(
    input: RpcActionDescribeInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcActionDescribeResult>> {
    return this.#business(context, async () => {
      if (!this.#options.actionService)
        throw new Error('Action service missing')
      const sourceId = this.#options.sourceService.resolveSourceId(input.source)
      const parsed = rpcActionDescribeResultSchema.safeParse(
        this.#options.actionService.describe({
          actionId: input.actionId,
          sourceId,
        }),
      )
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  runAction(
    input: Parameters<DaemonRpcApplication['action']['run']>[0],
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcActionRunResult>> {
    return this.#business(context, async (signal) => {
      if (!this.#options.actionService)
        throw new Error('Action service missing')
      const sourceId = this.#options.sourceService.resolveSourceId(input.source)
      const result = await this.#options.actionService.run({
        actionId: input.actionId,
        sourceId,
        actionInput: input.actionInput,
        signal,
        confirmIrreversible: input.confirmIrreversible,
      })
      const parsed = rpcActionRunResultSchema.safeParse({
        resource: presentResource(result.resource),
        warnings: result.warnings,
      })
      if (!parsed.success) throw new ResultTooLargeError()
      return parsed.data
    })
  }

  getStatus(
    input: RpcStatusInput,
    context: RpcRequestContext,
  ): Promise<RpcResult<RpcStatusResult>> {
    return this.#business(
      context,
      async () => {
        const sourceId = input.source
          ? this.#options.sourceService.resolveSourceId(input.source)
          : undefined
        return {
          rows: this.#options.sourceService
            .getStatus(sourceId ? { sourceId } : {})
            .map(statusRow),
        }
      },
      false,
    )
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
    resetsIdle = true,
  ): Promise<RpcResult<T>> {
    if (this.#lifecycle !== 'ready')
      return Promise.resolve(unavailable(this.#lifecycle))
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
    this.#touchIdle(resetsIdle)

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
        this.#touchIdle(resetsIdle)
      })
  }

  #businessStream<TEvent, TResult>(
    context: RpcRequestContext,
    invoke: (
      signal: AbortSignal,
      emit: (event: TEvent) => Promise<void>,
    ) => Promise<TResult>,
  ): Promise<RpcResult<AsyncIteratorObject<TEvent, RpcResult<TResult>, void>>> {
    if (this.#lifecycle !== 'ready')
      return Promise.resolve(unavailable(this.#lifecycle))
    const controller = new AbortController()
    const rendezvous = new StreamRendezvous<TEvent, RpcResult<TResult>>()
    const cancellation = new CtxindexSyncError('Sync cancelled', 'cancelled')
    const cancel = () => {
      controller.abort(context.signal.reason)
      rendezvous.close(cancellation)
    }
    if (context.signal.aborted) cancel()
    else context.signal.addEventListener('abort', cancel, { once: true })

    const key = `${context.requestId}:${this.#requestSequence++}`
    let settle!: () => void
    const settled = new Promise<void>((resolve) => {
      settle = resolve
    })
    this.#active.set(key, { controller, settled })
    this.#touchIdle(true)

    const producer = invoke(controller.signal, (event) =>
      rendezvous.push(event),
    )
      .then((value) =>
        rendezvous.finish(
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
        ),
      )
      .catch((error) =>
        rendezvous.finish({
          ok: false,
          error: controller.signal.aborted
            ? {
                kind: 'cancelled',
                code: 'cancelled',
                message: 'The request was cancelled.',
              }
            : failure(error),
        }),
      )
      .finally(() => {
        context.signal.removeEventListener('abort', cancel)
        this.#active.delete(key)
        settle()
        this.#touchIdle(true)
      })

    let completed = false
    const cancelledResult: RpcResult<TResult> = {
      ok: false,
      error: {
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The request was cancelled.',
      },
    }
    const stop = async (): Promise<void> => {
      if (completed) return
      controller.abort()
      rendezvous.close(cancellation)
      await producer
      completed = true
    }
    const iterator: AsyncIteratorObject<TEvent, RpcResult<TResult>, void> = {
      [Symbol.asyncIterator]() {
        return this
      },
      async [Symbol.asyncDispose]() {
        await stop()
      },
      async next() {
        const step = await rendezvous.next()
        if (step.done) completed = true
        return step
      },
      async return(value) {
        await stop()
        return {
          done: true,
          value: value === undefined ? cancelledResult : await value,
        }
      },
      async throw(error) {
        await stop()
        throw error
      },
    }
    return Promise.resolve({ ok: true, value: iterator })
  }

  #touchIdle(resetDeadline: boolean): void {
    const timeoutMs = this.#options.idleTimeoutMs
    const timer = this.#options.idleTimer
    if (timeoutMs === undefined || timer === undefined) return
    if (this.#lifecycle !== 'ready') return
    if (resetDeadline || this.#idleDeadline === undefined) {
      this.#idleDeadline = timer.now() + timeoutMs
    }
    this.#clearIdleTimer()
    const deadline = this.#idleDeadline
    const generation = this.#idleGeneration
    this.#idleTimerHandle = timer.setTimeout(
      () => {
        if (generation !== this.#idleGeneration) return
        this.#idleTimerHandle = undefined
        if (this.#lifecycle !== 'ready' || this.#active.size > 0) return
        if (timer.now() < deadline) {
          this.#touchIdle(false)
          return
        }
        this.beginStopping()
      },
      Math.max(0, deadline - timer.now()),
    )
  }

  #clearIdleTimer(): void {
    this.#idleGeneration++
    if (this.#idleTimerHandle === undefined) return
    this.#options.idleTimer?.clearTimeout(this.#idleTimerHandle)
    this.#idleTimerHandle = undefined
  }
}
