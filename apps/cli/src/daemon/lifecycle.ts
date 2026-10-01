import {
  accessSync,
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  rmSync,
  statSync,
} from 'node:fs'
import { platform, userInfo } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { CtxindexError } from '@ctxindex/core/errors'
import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import {
  acquireFileLease,
  cleanupDiscoveryMetadata,
  createFileLeaseBackend,
  type DiscoveryCleanupResult,
  type FileLease,
  FileLeaseConflictError,
  FileLeaseUnsupportedError,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'
import type { RpcHealthResult } from '@ctxindex/rpc'
import { assertInitialized } from '../commands/db'
import {
  DaemonCliError,
  type DaemonSelection,
  daemonHealth,
  daemonShutdown,
  selectDaemon,
} from './client'

declare const __CTXINDEX_PACKAGED__: boolean | undefined

const STARTUP_TIMEOUT_MS = 10_000
const OBSERVATION_TIMEOUT_MS = 5_000
const SHUTDOWN_TIMEOUT_MS = 10_000
const POLL_INTERVAL_MS = 25

export interface DaemonLaunchResolutionOptions {
  readonly sourceMode?: boolean
  readonly processExecutable?: string
  readonly compiledDaemonOverride?: string
}

export function resolveDaemonLaunch(
  options: DaemonLaunchResolutionOptions = {},
): string[] {
  const processExecutable = options.processExecutable ?? process.execPath
  const sourceMode =
    options.sourceMode ??
    (typeof __CTXINDEX_PACKAGED__ === 'undefined' &&
      basename(processExecutable) === 'bun')
  if (sourceMode) {
    return [
      processExecutable,
      join(import.meta.dir, '..', '..', '..', 'daemon', 'src', 'main.ts'),
    ]
  }
  const configured =
    options.compiledDaemonOverride ?? process.env.CTXINDEX_DAEMON_EXECUTABLE
  const candidates = configured
    ? [configured]
    : [
        join(import.meta.dir, 'ctxindex-daemon'),
        join(dirname(processExecutable), 'ctxindex-daemon'),
      ]
  for (const executable of new Set(candidates)) {
    try {
      if (!isAbsolute(executable) || !statSync(executable).isFile()) continue
      accessSync(executable, constants.X_OK)
      return [executable]
    } catch {}
  }
  throw new Error(
    'The compiled daemon executable is unavailable beside ctxindex.',
  )
}

interface BackgroundSpawnOptions {
  readonly detached: true
  readonly stdin: 'ignore'
  readonly stdout: number
  readonly stderr: number
  readonly env: NodeJS.ProcessEnv
}

export interface BackgroundLaunchDependencies {
  readonly openDiagnostics: (stateRoot: string) => number
  readonly closeDescriptor: (descriptor: number) => void
  readonly spawn: (
    argv: readonly string[],
    options: BackgroundSpawnOptions,
  ) => { unref(): void }
}

export function openDaemonDiagnostics(stateRoot: string): number {
  const directory = join(stateRoot, 'daemon')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const directoryStat = lstatSync(directory)
  if (
    !directoryStat.isDirectory() ||
    directoryStat.isSymbolicLink() ||
    directoryStat.uid !== userInfo().uid
  ) {
    throw new Error('Daemon diagnostics directory is unsafe')
  }
  chmodSync(directory, 0o700)
  const fd = openSync(
    join(directory, 'startup.log'),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_TRUNC |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fchmodSync(fd, 0o600)
    const stat = fstatSync(fd)
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      stat.uid !== userInfo().uid ||
      (stat.mode & 0o777) !== 0o600
    ) {
      throw new Error('Daemon diagnostics target is unsafe')
    }
    return fd
  } catch (error) {
    closeSync(fd)
    throw error
  }
}

const defaultBackgroundLaunchDependencies: BackgroundLaunchDependencies = {
  openDiagnostics: openDaemonDiagnostics,
  closeDescriptor: closeSync,
  spawn: (argv, options) => Bun.spawn([...argv], options),
}

const DAEMON_ENVIRONMENT_ALLOWLIST = [
  'HOME',
  'USER',
  'LOGNAME',
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'NODE_ENV',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'CTXINDEX_CONFIG_HOME',
  'CTXINDEX_DATA_HOME',
  'CTXINDEX_STATE_HOME',
  'CTXINDEX_CACHE_HOME',
  'CTXINDEX_DAEMON_RUNTIME_ROOT',
  'CTXINDEX_BUILD_VERSION',
  'CTXINDEX_LOG_LEVEL',
  'CTXINDEX_LOG_SYNC',
  'CTXINDEX_SECRETS_PASSPHRASE',
  'CTXINDEX_KEYTAR_MOCK_FILE',
  'CTXINDEX_TEST_LOG_ROTATE_BYTES',
  'CTXINDEX_TEST_LOG_SPAM_BYTES',
  'CTXINDEX_TEST_SYNC_DELAY_MS',
  'CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__',
] as const

const DAEMON_PROVIDER_TEST_ENVIRONMENT_ALLOWLIST = [
  'CTXINDEX_GRAPH_MOCK_BASE_URL',
  'CTXINDEX_GOOGLE_CALENDAR_MOCK_BASE_URL',
  'CTXINDEX_GMAIL_MOCK_BASE_URL',
] as const

export function daemonSpawnEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const name of DAEMON_ENVIRONMENT_ALLOWLIST) {
    const value = source[name]
    if (value !== undefined) environment[name] = value
  }
  if (source.NODE_ENV === 'test') {
    for (const name of DAEMON_PROVIDER_TEST_ENVIRONMENT_ALLOWLIST) {
      const value = source[name]
      if (value !== undefined) environment[name] = value
    }
  }
  return environment
}

export function launchBackgroundDaemon(
  argv: readonly string[],
  stateRoot: string,
  dependencies: BackgroundLaunchDependencies = defaultBackgroundLaunchDependencies,
): void {
  const descriptor = dependencies.openDiagnostics(stateRoot)
  try {
    const child = dependencies.spawn(argv, {
      detached: true,
      stdin: 'ignore',
      stdout: descriptor,
      stderr: descriptor,
      env: daemonSpawnEnvironment(),
    })
    child.unref()
  } finally {
    dependencies.closeDescriptor(descriptor)
  }
}

export type DaemonStatusResult =
  | { readonly status: 'unsupported' }
  | { readonly status: 'stopped' }
  | {
      readonly status: 'starting' | 'stopping' | 'unavailable'
      readonly instanceId: string
      readonly pid: number
      readonly startedAt: string
    }
  | { readonly status: 'running'; readonly health: RpcHealthResult }

export interface DaemonStartResult {
  readonly status: 'running'
  readonly started: boolean
  readonly health: RpcHealthResult
}

export type DaemonStopResult =
  | {
      readonly status: 'stopped'
      readonly alreadyStopped: boolean
      readonly instanceId?: string
    }
  | { readonly status: 'unsupported'; readonly alreadyStopped: true }

export interface DaemonLifecycle {
  start(signal?: AbortSignal): Promise<DaemonStartResult>
  status(signal?: AbortSignal): Promise<DaemonStatusResult>
  stop(signal?: AbortSignal): Promise<DaemonStopResult>
}

export type StaleCleanupResult = DiscoveryCleanupResult | 'busy'

export interface DaemonLifecycleDependencies {
  readonly supported: () => boolean
  readonly assertInitialized: () => Promise<void>
  readonly runtimeKey: () => string
  readonly select: () => DaemonSelection | null
  readonly health: typeof daemonHealth
  readonly shutdown: typeof daemonShutdown
  readonly launch: () => void
  readonly cleanupStale: (selection: DaemonSelection) => StaleCleanupResult
  readonly now: () => number
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly timeoutSignal: (milliseconds: number) => AbortSignal
}

function currentRuntime() {
  return resolveRuntimeIdentity({
    configRoot: configDir(),
    dataRoot: dataDir(),
    stateRoot: stateDir(),
    cacheRoot: cacheDir(),
  })
}

function supportsDaemonOwnership(): boolean {
  try {
    createFileLeaseBackend({ platform: platform() })
    return true
  } catch (error) {
    if (
      error instanceof FileLeaseUnsupportedError &&
      error.reason === 'platform'
    ) {
      return false
    }
    throw error
  }
}

function staleEndpointStat(path: string) {
  try {
    const stat = lstatSync(path)
    if (
      stat.isSymbolicLink() ||
      !stat.isSocket() ||
      stat.nlink !== 1 ||
      stat.uid !== userInfo().uid
    ) {
      throw new Error('Daemon endpoint is unsafe')
    }
    return stat
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export function removeStaleDaemonEndpoint(path: string): void {
  if (staleEndpointStat(path) === null) return
  rmSync(path)
}

function cleanupStaleDaemon(selection: DaemonSelection): StaleCleanupResult {
  if (selection.metadata === null || selection.selectedBy !== 'metadata') {
    return 'not_owner'
  }
  let lease: FileLease
  try {
    lease = acquireFileLease({
      canonicalTarget: selection.roots.stateRoot,
      purpose: 'lifecycle',
      mode: 'exclusive',
    })
  } catch (error) {
    if (error instanceof FileLeaseConflictError) return 'busy'
    throw error
  }
  try {
    staleEndpointStat(selection.endpoint)
    const result = cleanupDiscoveryMetadata(
      selection.roots.stateRoot,
      selection.metadata,
      lease,
    )
    if (result === 'removed') removeStaleDaemonEndpoint(selection.endpoint)
    return result
  } finally {
    lease.release()
  }
}

const defaultDependencies: DaemonLifecycleDependencies = {
  supported: supportsDaemonOwnership,
  assertInitialized,
  runtimeKey: () => currentRuntime().identity.tupleDigest,
  select: selectDaemon,
  health: daemonHealth,
  shutdown: daemonShutdown,
  launch: () => {
    const runtime = currentRuntime()
    launchBackgroundDaemon(resolveDaemonLaunch(), runtime.stateRoot)
  },
  cleanupStale: cleanupStaleDaemon,
  now: () => performance.now(),
  sleep: Bun.sleep,
  timeoutSignal: (milliseconds) => AbortSignal.timeout(milliseconds),
}

function unavailable(message: string): DaemonCliError {
  return new DaemonCliError({
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message,
  })
}

function lifecycleFailure(
  action: 'start' | 'status' | 'stop',
  error: unknown,
): never {
  if (
    error instanceof DaemonCliError ||
    (error instanceof CtxindexError && error.code === 'invalid_args') ||
    (error instanceof Error && 'code' in error && error.code === 'cancelled')
  ) {
    throw error
  }
  const messages = {
    start: 'The local daemon could not be started safely.',
    status: 'The local daemon status could not be inspected safely.',
    stop: 'The local daemon could not be stopped safely.',
  } as const
  throw unavailable(messages[action])
}

function cancelled(): Error & { readonly code: 'cancelled' } {
  return Object.assign(new Error('Daemon lifecycle operation was cancelled.'), {
    code: 'cancelled' as const,
  })
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled()
}

function transitionalStatus(selection: DaemonSelection): DaemonStatusResult {
  const metadata = selection.metadata
  if (metadata === null) {
    return {
      status: 'unavailable',
      instanceId: 'test-override',
      pid: process.pid,
      startedAt: new Date(0).toISOString(),
    }
  }
  return {
    status: metadata.lifecycle === 'ready' ? 'unavailable' : metadata.lifecycle,
    instanceId: metadata.instanceId,
    pid: metadata.pid,
    startedAt: metadata.startedAt,
  }
}

const starts = new Map<string, Promise<DaemonStartResult>>()
const boundedTimeout = Symbol('boundedTimeout')

export function createDaemonLifecycle(
  dependencies: DaemonLifecycleDependencies = defaultDependencies,
): DaemonLifecycle {
  async function runBounded<T>(
    timeoutMs: number,
    signal: AbortSignal | undefined,
    operation: (requestSignal: AbortSignal) => Promise<T>,
  ): Promise<T | null> {
    throwIfCancelled(signal)
    const deadlineSignal = dependencies.timeoutSignal(
      Math.max(1, Math.ceil(timeoutMs)),
    )
    const requestSignal = signal
      ? AbortSignal.any([signal, deadlineSignal])
      : deadlineSignal
    let resolveAbort!: (value: typeof boundedTimeout) => void
    const aborted = new Promise<typeof boundedTimeout>((resolve) => {
      resolveAbort = resolve
    })
    const onAbort = () => resolveAbort(boundedTimeout)
    if (requestSignal.aborted) onAbort()
    else requestSignal.addEventListener('abort', onAbort, { once: true })
    try {
      const result = await Promise.race([operation(requestSignal), aborted])
      if (result === boundedTimeout) {
        throwIfCancelled(signal)
        return null
      }
      return result
    } catch (error) {
      if (deadlineSignal.aborted && !signal?.aborted) return null
      throw error
    } finally {
      requestSignal.removeEventListener('abort', onAbort)
    }
  }

  async function healthOrNull(
    selection: DaemonSelection,
    signal?: AbortSignal,
    timeoutMs = OBSERVATION_TIMEOUT_MS,
  ): Promise<RpcHealthResult | null> {
    try {
      return await runBounded(timeoutMs, signal, (requestSignal) =>
        dependencies.health(selection, requestSignal),
      )
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'cancelled'
      ) {
        throw error
      }
      if (error instanceof DaemonCliError) {
        if (error.code !== 'daemon_unavailable') throw error
      }
      return null
    }
  }

  async function waitForReady(
    deadline: number,
    signal?: AbortSignal,
  ): Promise<RpcHealthResult | null> {
    while (dependencies.now() <= deadline) {
      throwIfCancelled(signal)
      const selection = dependencies.select()
      if (selection) {
        const health = await healthOrNull(
          selection,
          signal,
          deadline - dependencies.now(),
        )
        if (health?.ready) return health
      }
      await dependencies.sleep(POLL_INTERVAL_MS)
    }
    return null
  }

  async function waitForOwnerReleaseOrReady(
    deadline: number,
    signal?: AbortSignal,
  ): Promise<
    | { readonly status: 'ready'; readonly health: RpcHealthResult }
    | { readonly status: 'released' }
    | { readonly status: 'timeout' }
  > {
    while (dependencies.now() <= deadline) {
      throwIfCancelled(signal)
      const current = dependencies.select()
      if (!current) return { status: 'released' }
      const remaining = deadline - dependencies.now()
      const observed = await healthOrNull(
        current,
        signal,
        Math.min(OBSERVATION_TIMEOUT_MS, Math.max(1, remaining)),
      )
      if (observed?.ready) return { status: 'ready', health: observed }
      if (current.selectedBy === 'metadata') {
        const cleaned = dependencies.cleanupStale(current)
        if (cleaned === 'removed' || cleaned === 'missing') {
          return { status: 'released' }
        }
      }
      if (dependencies.now() >= deadline) break
      await dependencies.sleep(POLL_INTERVAL_MS)
    }
    return { status: 'timeout' }
  }

  async function startOnce(signal?: AbortSignal): Promise<DaemonStartResult> {
    throwIfCancelled(signal)
    if (!dependencies.supported()) {
      throw unavailable('The local daemon is unsupported on this platform.')
    }
    await dependencies.assertInitialized()
    throwIfCancelled(signal)
    const deadline = dependencies.now() + STARTUP_TIMEOUT_MS
    const existing = dependencies.select()
    if (existing) {
      const ready = await healthOrNull(existing, signal)
      if (ready?.ready)
        return { status: 'running', started: false, health: ready }
      if (existing.selectedBy === 'test_override') {
        throw unavailable('The selected daemon test endpoint is unavailable.')
      }
      if (
        existing.metadata?.lifecycle === 'starting' ||
        existing.metadata?.lifecycle === 'stopping'
      ) {
        const transition = await waitForOwnerReleaseOrReady(deadline, signal)
        if (transition.status === 'ready') {
          return {
            status: 'running',
            started: false,
            health: transition.health,
          }
        }
        if (transition.status === 'timeout') {
          throw unavailable(
            'The local daemon did not become ready. Inspect `ctxindex daemon status` and the private daemon startup log.',
          )
        }
      }
    }
    try {
      dependencies.launch()
    } catch {
      throw unavailable(
        'The local daemon could not be launched. Inspect the private daemon startup log.',
      )
    }
    const ready = await waitForReady(deadline, signal)
    if (!ready) {
      throw unavailable(
        'The local daemon did not become ready. Inspect `ctxindex daemon status` and the private daemon startup log.',
      )
    }
    return { status: 'running', started: true, health: ready }
  }

  return {
    async start(signal) {
      try {
        const key = dependencies.runtimeKey()
        const current = starts.get(key)
        if (current) return current
        const pending = startOnce(signal)
        starts.set(key, pending)
        try {
          return await pending
        } finally {
          if (starts.get(key) === pending) starts.delete(key)
        }
      } catch (error) {
        lifecycleFailure('start', error)
      }
    },
    async status(signal) {
      try {
        throwIfCancelled(signal)
        if (!dependencies.supported()) return { status: 'unsupported' }
        const selection = dependencies.select()
        if (!selection) return { status: 'stopped' }
        const ready = await healthOrNull(selection, signal)
        return ready?.ready
          ? { status: 'running', health: ready }
          : transitionalStatus(selection)
      } catch (error) {
        lifecycleFailure('status', error)
      }
    },
    async stop(signal) {
      try {
        throwIfCancelled(signal)
        if (!dependencies.supported()) {
          return { status: 'unsupported', alreadyStopped: true }
        }
        const selection = dependencies.select()
        if (!selection) return { status: 'stopped', alreadyStopped: true }
        const ready = await healthOrNull(selection, signal)
        if (ready !== null) {
          const accepted = await runBounded(
            SHUTDOWN_TIMEOUT_MS,
            signal,
            (requestSignal) => dependencies.shutdown(selection, requestSignal),
          )
          if (!accepted) {
            throw unavailable(
              'The local daemon did not complete graceful shutdown; retry `ctxindex daemon stop`.',
            )
          }
          return {
            status: 'stopped',
            alreadyStopped: false,
            instanceId: accepted.instanceId,
          }
        }
        let cleaned: StaleCleanupResult
        try {
          cleaned = dependencies.cleanupStale(selection)
        } catch {
          throw unavailable(
            'The local daemon stale state could not be cleaned safely.',
          )
        }
        if (cleaned === 'removed' || cleaned === 'missing') {
          return {
            status: 'stopped',
            alreadyStopped: false,
            ...(selection.metadata
              ? { instanceId: selection.metadata.instanceId }
              : {}),
          }
        }
        throw unavailable(
          'The local daemon is unavailable but still owns lifecycle state; retry `ctxindex daemon stop`.',
        )
      } catch (error) {
        lifecycleFailure('stop', error)
      }
    },
  }
}

const lifecycle = createDaemonLifecycle()

export const daemonStart = lifecycle.start
export const daemonStatus = lifecycle.status
export const daemonStop = lifecycle.stop
