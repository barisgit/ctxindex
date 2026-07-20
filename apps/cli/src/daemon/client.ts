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
  type RpcFailure,
  type RpcHealthResult,
  type RpcRealmAddInput,
  type RpcRealmAddResult,
  type RpcRealmListResult,
  type RpcResourceGetResult,
  type RpcSearchInput,
  type RpcSearchResult,
  type RpcShutdownAccepted,
  type RpcSourceAddInput,
  type RpcSourceAddResult,
  type RpcSourceDefinitionsResult,
  type RpcSourceListInput,
  type RpcSourceListResult,
  type RpcSourceRemoveResult,
  type RpcStatusResult,
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
  version: 1,
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

function unavailable(): DaemonCliError {
  return new DaemonCliError({
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message:
      'The local daemon is unavailable. Start it with `ctxindex daemon serve`.',
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
    headers: {
      'x-ctxindex-protocol-id': CLI_DAEMON_PROTOCOL.id,
      'x-ctxindex-protocol-version': String(CLI_DAEMON_PROTOCOL.version),
      'x-ctxindex-runtime': JSON.stringify(selection.roots.identity),
    },
    fetch: async (request) =>
      fetch(request, { unix: selection.endpoint } as RequestInit),
  })
  return createORPCClient<DaemonClient>(link)
}

function requestOptions(signal: AbortSignal | undefined) {
  return signal ? { signal } : {}
}

async function invoke<T>(
  signal: AbortSignal | undefined,
  call: (client: DaemonClient) => Promise<T>,
  selection: DaemonSelection,
): Promise<T> {
  let result: T
  try {
    result = await call(createClient(selection))
  } catch (error) {
    if (signal?.aborted) {
      throw new DaemonCliError({
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The daemon request was cancelled.',
      })
    }
    const failure = daemonFailureFromDeclaredError(error)
    if (failure) throw new DaemonCliError(failure)
    throw unavailable()
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

export async function daemonSync(
  selection: DaemonSelection,
  input: RpcSyncInput,
  signal?: AbortSignal,
): Promise<RpcSyncResult> {
  return invoke(
    signal,
    (client) => client.sync.run(input, requestOptions(signal)),
    selection,
  )
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
