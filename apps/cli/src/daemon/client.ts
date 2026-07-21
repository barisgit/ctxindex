import { chmod, link, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { CtxindexError } from '@ctxindex/core/errors'
import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import {
  acquireFileLease,
  type DiscoveryMetadata,
  endpointToken,
  type FileLease,
  readDiscoveryMetadata,
  resolveEndpoint,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'
import {
  type DaemonClient,
  type RpcAccountAddInput,
  type RpcAccountAddResult,
  type RpcAccountListResult,
  type RpcAccountRemoveResult,
  type RpcActionDescribeInput,
  type RpcActionDescribeResult,
  type RpcActionRunResult,
  type RpcByteTransferDescriptor,
  type RpcDocumentationGetInput,
  type RpcDocumentationGetResult,
  type RpcDocumentationListInput,
  type RpcDocumentationListResult,
  type RpcDocumentationSearchInput,
  type RpcDocumentationSearchResult,
  type RpcExportInput,
  type RpcExportResult,
  type RpcFailure,
  type RpcHealthResult,
  type RpcOAuthAppAddInput,
  type RpcOAuthAppAddResult,
  type RpcOAuthAppListResult,
  type RpcOAuthAppRegistrationResult,
  type RpcOAuthAppRemoveResult,
  type RpcRealmAddInput,
  type RpcRealmAddResult,
  type RpcRealmListResult,
  type RpcResourceGetResult,
  type RpcSearchInput,
  type RpcSearchResult,
  type RpcSecretsBackendSetInput,
  type RpcSecretsBackendSetResult,
  type RpcSecretsStatusResult,
  type RpcShutdownAccepted,
  type RpcSourceAddInput,
  type RpcSourceAddResult,
  type RpcSourceDefinitionsResult,
  type RpcSourceListInput,
  type RpcSourceListResult,
  type RpcSourceRemoveResult,
  type RpcStatusResult,
  type RpcSyncEvent,
  type RpcSyncInput,
  type RpcSyncResult,
  type RpcThreadGetResult,
  rpcFailureRegistry,
  rpcFailureSchema,
} from '@ctxindex/rpc'
import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

export const CLI_DAEMON_PROTOCOL = {
  id: 'ctxindex.local',
  version: 2,
} as const

export class DaemonCliError extends Error {
  readonly code: string
  readonly failure: RpcFailure

  constructor(failure: RpcFailure) {
    super(failure.message)
    this.name = 'DaemonCliError'
    this.code = failure.code
    this.failure = failure
  }
}

export interface DaemonSelection {
  readonly endpoint: string
  readonly roots: ReturnType<typeof resolveRuntimeIdentity>
  readonly metadata: DiscoveryMetadata | null
  readonly selectedBy: 'metadata' | 'test_override'
}

type DaemonReconnect = (signal?: AbortSignal) => Promise<DaemonSelection>
const daemonReconnects = new WeakMap<DaemonSelection, DaemonReconnect>()

export function registerDaemonReconnect(
  selection: DaemonSelection,
  reconnect: DaemonReconnect,
): DaemonSelection {
  daemonReconnects.set(selection, reconnect)
  return selection
}

function unavailable(selection?: DaemonSelection): DaemonCliError {
  const lifecycle = selection?.metadata?.lifecycle
  return new DaemonCliError({
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message:
      lifecycle === 'starting'
        ? 'The local daemon is starting and is not yet available.'
        : lifecycle === 'stopping'
          ? 'The local daemon is stopping and is no longer available.'
          : 'The local daemon is unavailable. Start it with `ctxindex daemon start`.',
  })
}

function roots(): ReturnType<typeof resolveRuntimeIdentity> {
  return resolveRuntimeIdentity({
    configRoot: configDir(),
    dataRoot: dataDir(),
    stateRoot: stateDir(),
    cacheRoot: cacheDir(),
  })
}

function validateTestEndpointOverride(
  endpoint: string | undefined,
): string | undefined {
  if (!endpoint) return undefined
  if (!endpoint.startsWith('/') || Buffer.byteLength(endpoint, 'utf8') > 103) {
    throw new DaemonCliError({
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message: 'The local daemon test endpoint override is invalid.',
    })
  }
  return endpoint
}

export function selectDaemon(): DaemonSelection | null {
  const runtime = roots()
  return selectDaemonForRuntime(runtime, {
    ...(process.env.CTXINDEX_DAEMON_TEST_ENDPOINT
      ? { testEndpoint: process.env.CTXINDEX_DAEMON_TEST_ENDPOINT }
      : {}),
    ...(process.env.CTXINDEX_DAEMON_RUNTIME_ROOT
      ? { endpointRuntimeRoot: process.env.CTXINDEX_DAEMON_RUNTIME_ROOT }
      : {}),
  })
}

export interface SelectDaemonOptions {
  readonly testEndpoint?: string
  readonly endpointRuntimeRoot?: string
  readonly readMetadata?: typeof readDiscoveryMetadata
}

function metadataRuntime(metadata: DiscoveryMetadata) {
  return {
    tupleDigest: metadata.tupleDigest,
    configDigest: metadata.configDigest,
    dataDigest: metadata.dataDigest,
    stateDigest: metadata.stateDigest,
    cacheDigest: metadata.cacheDigest,
    databaseDigest: metadata.databaseDigest,
  }
}

function runtimeMatches(
  metadata: DiscoveryMetadata,
  runtime: ReturnType<typeof resolveRuntimeIdentity>,
): boolean {
  return (
    metadata.tupleDigest === runtime.identity.tupleDigest &&
    metadata.configDigest === runtime.identity.configDigest &&
    metadata.dataDigest === runtime.identity.dataDigest &&
    metadata.stateDigest === runtime.identity.stateDigest &&
    metadata.cacheDigest === runtime.identity.cacheDigest &&
    metadata.databaseDigest === runtime.identity.databaseDigest &&
    metadata.endpointToken === endpointToken(runtime.identity)
  )
}

export function selectDaemonForRuntime(
  runtime: ReturnType<typeof resolveRuntimeIdentity>,
  options: SelectDaemonOptions = {},
): DaemonSelection | null {
  const override = validateTestEndpointOverride(options.testEndpoint)
  if (override) {
    return {
      endpoint: override,
      roots: runtime,
      metadata: null,
      selectedBy: 'test_override',
    }
  }
  const metadata = (options.readMetadata ?? readDiscoveryMetadata)(
    runtime.stateRoot,
  )
  if (metadata === null) return null
  if (!runtimeMatches(metadata, runtime)) {
    throw new DaemonCliError({
      kind: 'runtime_identity_mismatch',
      code: 'runtime_identity_mismatch',
      message: 'The discovered daemon belongs to a different runtime.',
      clientRuntime: runtime.identity,
      daemonRuntime: metadataRuntime(metadata),
    })
  }
  const endpoint = resolveEndpoint(
    runtime.identity,
    options.endpointRuntimeRoot
      ? { runtimeRoot: options.endpointRuntimeRoot }
      : {},
  )
  return {
    endpoint: endpoint.path,
    roots: runtime,
    metadata,
    selectedBy: 'metadata',
  }
}

function createClient(selection: DaemonSelection): DaemonClient {
  const link = new RPCLink({
    url: 'http://localhost/rpc',
    headers: daemonHeaders(selection),
    fetch: async (request, init) =>
      fetch(request, { ...init, unix: selection.endpoint } as RequestInit),
  })
  return createORPCClient<DaemonClient>(link)
}

function daemonHeaders(selection: DaemonSelection): Record<string, string> {
  return {
    'x-ctxindex-protocol-id': CLI_DAEMON_PROTOCOL.id,
    'x-ctxindex-protocol-version': String(CLI_DAEMON_PROTOCOL.version),
    'x-ctxindex-runtime': JSON.stringify(selection.roots.identity),
  }
}

export interface DaemonSyncServices {
  readonly createClient: (selection: DaemonSelection) => DaemonClient
}

const defaultDaemonSyncServices: DaemonSyncServices = { createClient }

function requestOptions(signal: AbortSignal | undefined) {
  return signal ? { signal } : {}
}

async function invoke<T>(
  signal: AbortSignal | undefined,
  call: (client: DaemonClient, selection: DaemonSelection) => Promise<T>,
  selection: DaemonSelection,
  clientFactory: (selection: DaemonSelection) => DaemonClient = createClient,
): Promise<T> {
  let result: T
  try {
    result = await call(clientFactory(selection), selection)
  } catch (error) {
    const failure = daemonFailureFromDeclaredError(error)
    const reconnect = daemonReconnects.get(selection)
    if (failure?.kind !== 'daemon_unavailable' || !reconnect) {
      throw invocationError(error, signal, selection)
    }
    const replacement = await reconnect(signal)
    try {
      result = await call(clientFactory(replacement), replacement)
    } catch (retryError) {
      throw invocationError(retryError, signal, replacement)
    }
  }
  if (signal?.aborted) {
    throw new DaemonCliError({
      kind: 'cancelled',
      code: 'cancelled',
      message: 'The daemon request was cancelled.',
    })
  }
  return result
}

export interface DaemonExportResult extends Omit<RpcExportResult, 'transfer'> {
  readonly bytes: Uint8Array
}

export interface DaemonExportServices {
  readonly createClient: (selection: DaemonSelection) => DaemonClient
  readonly fetch: typeof fetch
}

export interface DaemonTransferServices {
  readonly fetch: typeof fetch
}

const defaultDaemonExportServices: DaemonExportServices = {
  createClient,
  fetch: globalThis.fetch,
}

export async function daemonExport(
  selection: DaemonSelection,
  input: RpcExportInput,
  signal?: AbortSignal,
  services: DaemonExportServices = defaultDaemonExportServices,
): Promise<DaemonExportResult> {
  const prepared = await invoke(
    signal,
    (client) => client.export.prepare(input, requestOptions(signal)),
    selection,
    services.createClient,
  )
  const bytes = await daemonTransferBytes(
    selection,
    prepared.transfer,
    signal,
    services,
  )
  const { transfer: _transfer, ...metadata } = prepared
  return { ...metadata, bytes }
}

export async function daemonTransferBytes(
  selection: DaemonSelection,
  transfer: RpcByteTransferDescriptor,
  signal?: AbortSignal,
  services: DaemonTransferServices = defaultDaemonExportServices,
): Promise<Uint8Array> {
  let response: Response
  try {
    response = await services.fetch(
      `http://localhost/transfer/${transfer.ticket}`,
      {
        method: 'GET',
        headers: daemonHeaders(selection),
        redirect: 'manual',
        ...(signal ? { signal } : {}),
        unix: selection.endpoint,
      } as RequestInit,
    )
  } catch (error) {
    throw invocationError(error, signal, selection)
  }
  if (!response.ok) throw unavailable(selection)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (signal?.aborted)
    throw invocationError(new Error('cancelled'), signal, selection)
  if (bytes.byteLength !== transfer.byteSize) {
    throw new DaemonCliError({
      kind: 'ctxindex',
      taxonomy: 'other',
      code: 'data_integrity',
      message: 'The daemon byte transfer failed integrity validation.',
    })
  }
  return bytes
}

export async function daemonTransferToFile(
  selection: DaemonSelection,
  transfer: RpcByteTransferDescriptor,
  outputPath: string,
  signal?: AbortSignal,
  services: DaemonTransferServices = defaultDaemonExportServices,
): Promise<void> {
  const bytes = await daemonTransferBytes(selection, transfer, signal, services)
  const directory = dirname(outputPath)
  const temporaryDirectory = await mkdtemp(
    join(directory, `.${basename(outputPath)}.ctxindex-transfer-`),
  )
  const temporaryPath = join(temporaryDirectory, 'content')
  try {
    await writeFile(temporaryPath, bytes, { mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    try {
      await link(temporaryPath, outputPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new CtxindexError(
          `Output path already exists: ${outputPath}`,
          'output_exists',
        )
      }
      throw error
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

function invocationError(
  error: unknown,
  signal: AbortSignal | undefined,
  selection: DaemonSelection,
): DaemonCliError {
  if (signal?.aborted) {
    return new DaemonCliError({
      kind: 'cancelled',
      code: 'cancelled',
      message: 'The daemon request was cancelled.',
    })
  }
  const failure = daemonFailureFromDeclaredError(error)
  return failure ? new DaemonCliError(failure) : unavailable(selection)
}

export function daemonFailureFromDeclaredError(
  error: unknown,
): RpcFailure | null {
  try {
    if (!(error instanceof ORPCError) || !error.defined) return null
    const failure = rpcFailureSchema.safeParse(error.data)
    if (!failure.success) return null
    const definition = rpcFailureRegistry[failure.data.kind]
    return error.message === definition.message &&
      error.code === failure.data.kind
      ? failure.data
      : null
  } catch {
    return null
  }
}

export async function daemonHealth(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcHealthResult> {
  return invoke(
    signal,
    (client) => client.system.health({}, requestOptions(signal)),
    selection,
  )
}

export async function daemonDocumentationList(
  selection: DaemonSelection,
  input: RpcDocumentationListInput,
  signal?: AbortSignal,
): Promise<RpcDocumentationListResult> {
  return invoke(
    signal,
    (client) => client.documentation.list(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonDocumentationGet(
  selection: DaemonSelection,
  input: RpcDocumentationGetInput,
  signal?: AbortSignal,
): Promise<RpcDocumentationGetResult> {
  return invoke(
    signal,
    (client) => client.documentation.get(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonDocumentationSearch(
  selection: DaemonSelection,
  input: RpcDocumentationSearchInput,
  signal?: AbortSignal,
): Promise<RpcDocumentationSearchResult> {
  return invoke(
    signal,
    (client) => client.documentation.search(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonSync(
  selection: DaemonSelection,
  input: RpcSyncInput,
  signal?: AbortSignal,
  onEvent?: (event: RpcSyncEvent) => void | Promise<void>,
  services: DaemonSyncServices = defaultDaemonSyncServices,
): Promise<RpcSyncResult> {
  const iterator = await invoke(
    signal,
    (_client, selected) =>
      services.createClient(selected).sync.run(input, requestOptions(signal)),
    selection,
  )
  let completed = false
  try {
    while (true) {
      const step = await iterator.next()
      if (step.done) {
        completed = true
        return step.value
      }
      await onEvent?.(step.value)
    }
  } catch (error) {
    throw invocationError(error, signal, selection)
  } finally {
    if (!completed) {
      try {
        await iterator.return?.()
      } catch {}
    }
  }
}

export async function daemonRealmAdd(
  selection: DaemonSelection,
  input: RpcRealmAddInput,
  signal?: AbortSignal,
): Promise<RpcRealmAddResult> {
  return invoke(
    signal,
    (client) => client.realm.add(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonRealmList(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcRealmListResult> {
  return invoke(
    signal,
    (client) => client.realm.list({}, requestOptions(signal)),
    selection,
  )
}

export interface DaemonAccountInteraction {
  readonly emitAuthorizationUrl: (url: string) => void
  readonly readAuthorizationResponse: (input: {
    readonly signal: AbortSignal
  }) => Promise<string | undefined>
}

export interface DaemonAccountClientServices {
  readonly createClient: (selection: DaemonSelection) => DaemonClient
}

const defaultDaemonAccountClientServices: DaemonAccountClientServices = {
  createClient,
}

function linkedAbortController(signal?: AbortSignal): {
  readonly controller: AbortController
  readonly close: () => void
} {
  const controller = new AbortController()
  const abort = () => controller.abort(signal?.reason)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  return {
    controller,
    close: () => signal?.removeEventListener('abort', abort),
  }
}

export async function daemonAccountAdd(
  selection: DaemonSelection,
  input: RpcAccountAddInput,
  interaction: DaemonAccountInteraction,
  signal?: AbortSignal,
  services: DaemonAccountClientServices = defaultDaemonAccountClientServices,
): Promise<RpcAccountAddResult> {
  const iterator = await invoke(
    signal,
    () =>
      services
        .createClient(selection)
        .account.add(input, requestOptions(signal)),
    selection,
  )
  let completed = false
  try {
    const event = await iterator.next()
    if (event.done) {
      completed = true
      return event.value
    }
    interaction.emitAuthorizationUrl(event.value.authorizationUrl)
    const requestId = event.value.requestId
    const prompt = linkedAbortController(signal)
    try {
      const terminal = iterator.next()
      const response = interaction
        .readAuthorizationResponse({ signal: prompt.controller.signal })
        .then((value) => ({ kind: 'response' as const, value }))
      const winner = await Promise.race([
        terminal.then((value) => ({ kind: 'terminal' as const, value })),
        response,
      ])
      if (winner.kind === 'terminal') {
        prompt.controller.abort()
        if (!winner.value.done)
          throw new TypeError('Unexpected repeated authorization request')
        completed = true
        return winner.value.value
      }
      if (winner.value !== undefined) {
        const responseValue = winner.value
        await invoke(
          signal,
          () =>
            services
              .createClient(selection)
              .account.respond(
                { requestId, response: responseValue },
                requestOptions(signal),
              ),
          selection,
        )
      }
      const result = await terminal
      if (!result.done)
        throw new TypeError('Unexpected repeated authorization request')
      completed = true
      return result.value
    } finally {
      prompt.close()
    }
  } catch (error) {
    throw invocationError(error, signal, selection)
  } finally {
    if (!completed) {
      try {
        await iterator.return?.()
      } catch {}
    }
  }
}

export async function daemonAccountList(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcAccountListResult> {
  return invoke(
    signal,
    (client) => client.account.list({}, requestOptions(signal)),
    selection,
  )
}

export async function daemonAccountRemove(
  selection: DaemonSelection,
  label: string,
  signal?: AbortSignal,
): Promise<RpcAccountRemoveResult> {
  return invoke(
    signal,
    (client) => client.account.remove({ label }, requestOptions(signal)),
    selection,
  )
}

export async function daemonOAuthAppRegistration(
  selection: DaemonSelection,
  provider: string,
  signal?: AbortSignal,
): Promise<RpcOAuthAppRegistrationResult> {
  return invoke(
    signal,
    (client) =>
      client.oauthApp.registration({ provider }, requestOptions(signal)),
    selection,
  )
}

export async function daemonOAuthAppAdd(
  selection: DaemonSelection,
  input: RpcOAuthAppAddInput,
  signal?: AbortSignal,
): Promise<RpcOAuthAppAddResult> {
  return invoke(
    signal,
    (client) => client.oauthApp.add(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonOAuthAppList(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcOAuthAppListResult> {
  return invoke(
    signal,
    (client) => client.oauthApp.list({}, requestOptions(signal)),
    selection,
  )
}

export async function daemonOAuthAppRemove(
  selection: DaemonSelection,
  provider: string,
  label: string,
  signal?: AbortSignal,
): Promise<RpcOAuthAppRemoveResult> {
  return invoke(
    signal,
    (client) =>
      client.oauthApp.remove({ provider, label }, requestOptions(signal)),
    selection,
  )
}

export async function daemonSourceDefinitions(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcSourceDefinitionsResult> {
  return invoke(
    signal,
    (client) => client.source.definitions({}, requestOptions(signal)),
    selection,
  )
}

export async function daemonSourceAdd(
  selection: DaemonSelection,
  input: RpcSourceAddInput,
  signal?: AbortSignal,
): Promise<RpcSourceAddResult> {
  return invoke(
    signal,
    (client) => client.source.add(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonSourceList(
  selection: DaemonSelection,
  input: RpcSourceListInput,
  signal?: AbortSignal,
): Promise<RpcSourceListResult> {
  return invoke(
    signal,
    (client) => client.source.list(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonSourceRemove(
  selection: DaemonSelection,
  source: string,
  signal?: AbortSignal,
): Promise<RpcSourceRemoveResult> {
  return invoke(
    signal,
    (client) => client.source.remove({ source }, requestOptions(signal)),
    selection,
  )
}

export async function daemonSearch(
  selection: DaemonSelection,
  input: RpcSearchInput,
  signal?: AbortSignal,
): Promise<RpcSearchResult> {
  return invoke(
    signal,
    (client) => client.search.query(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonResourceGet(
  selection: DaemonSelection,
  ref: string,
  signal?: AbortSignal,
): Promise<RpcResourceGetResult> {
  return invoke(
    signal,
    (client) => client.resource.get({ ref }, requestOptions(signal)),
    selection,
  )
}

export async function daemonThreadGet(
  selection: DaemonSelection,
  ref: string,
  signal?: AbortSignal,
): Promise<RpcThreadGetResult> {
  return invoke(
    signal,
    (client) => client.thread.get({ ref }, requestOptions(signal)),
    selection,
  )
}

export async function daemonActionDescribe(
  selection: DaemonSelection,
  input: RpcActionDescribeInput,
  signal?: AbortSignal,
): Promise<RpcActionDescribeResult> {
  return invoke(
    signal,
    (client) => client.action.describe(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonActionRun(
  selection: DaemonSelection,
  input: {
    readonly actionId: string
    readonly source: string
    readonly actionInput: unknown
    readonly confirmIrreversible: boolean
  },
  signal?: AbortSignal,
): Promise<RpcActionRunResult> {
  return invoke(
    signal,
    (client) => client.action.run(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonStatus(
  selection: DaemonSelection,
  input: { readonly source?: string },
  signal?: AbortSignal,
): Promise<RpcStatusResult> {
  return invoke(
    signal,
    (client) => client.status.get(input, requestOptions(signal)),
    selection,
  )
}

export async function daemonSecretsStatus(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcSecretsStatusResult> {
  return invoke(
    signal,
    (client) => client.secrets.status({}, requestOptions(signal)),
    selection,
  )
}

export async function daemonSecretsBackendSet(
  selection: DaemonSelection,
  input: RpcSecretsBackendSetInput,
  signal?: AbortSignal,
): Promise<RpcSecretsBackendSetResult> {
  return invoke(
    signal,
    (client) => client.secrets.backend.set(input, requestOptions(signal)),
    selection,
  )
}

async function shutdownSettled(selection: DaemonSelection): Promise<boolean> {
  if (readDiscoveryMetadata(selection.roots.stateRoot) !== null) {
    return false
  }
  let lifecycle: FileLease | undefined
  let database: FileLease | undefined
  try {
    lifecycle = acquireFileLease({
      canonicalTarget: selection.roots.stateRoot,
      purpose: 'lifecycle',
      mode: 'shared',
    })
    database = acquireFileLease({
      canonicalTarget: selection.roots.databasePath,
      purpose: 'database',
      mode: 'shared',
    })
    return true
  } catch {
    return false
  } finally {
    database?.release()
    lifecycle?.release()
  }
}

export async function daemonShutdown(
  selection: DaemonSelection,
  signal?: AbortSignal,
): Promise<RpcShutdownAccepted> {
  const accepted = await invoke(
    signal,
    (client) => client.system.shutdown({}, requestOptions(signal)),
    selection,
  )
  const deadline = Date.now() + accepted.observationTimeoutMs
  while (Date.now() <= deadline) {
    if (signal?.aborted) {
      throw new DaemonCliError({
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The daemon request was cancelled.',
      })
    }
    if (await shutdownSettled(selection)) return accepted
    await Bun.sleep(10)
  }
  throw new DaemonCliError({
    kind: 'shutdown_timeout',
    code: 'shutdown_timeout',
    message:
      'The daemon did not finish shutdown before the observation timeout.',
    instanceId: accepted.instanceId,
    timeoutMs: accepted.observationTimeoutMs,
  })
}

export function requireDaemonSelection(): DaemonSelection {
  const selection = selectDaemon()
  if (selection === null) throw unavailable()
  return selection
}
