import { assertInitialized } from '../commands/db'
import {
  DaemonCliError,
  type DaemonSelection,
  registerDaemonReconnect,
  selectDaemon,
} from './client'
import {
  type DaemonLifecycle,
  daemonRuntimeKey,
  daemonStart,
  daemonStatus,
} from './lifecycle'

export type DaemonSelectionEnsureResult =
  | {
      readonly status: 'selected'
      readonly selection: DaemonSelection
      readonly started: boolean
    }
  | { readonly status: 'unsupported' }

export interface DaemonSelectionEnsurerDependencies {
  readonly assertInitialized: () => Promise<void>
  readonly runtimeKey: () => string
  readonly select: () => DaemonSelection | null
  readonly status: DaemonLifecycle['status']
  readonly start: DaemonLifecycle['start']
}

const defaultDependencies: DaemonSelectionEnsurerDependencies = {
  assertInitialized,
  runtimeKey: daemonRuntimeKey,
  select: selectDaemon,
  status: daemonStatus,
  start: daemonStart,
}

function cancelled(): DaemonCliError {
  return new DaemonCliError({
    kind: 'cancelled',
    code: 'cancelled',
    message: 'The daemon request was cancelled.',
  })
}

function unavailable(message: string): DaemonCliError {
  return new DaemonCliError({
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message,
  })
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled()
}

async function waitForEnsure<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  throwIfCancelled(signal)
  if (!signal) return pending
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(cancelled())
    signal.addEventListener('abort', onAbort, { once: true })
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function createDaemonSelectionEnsurer(
  dependencies: DaemonSelectionEnsurerDependencies = defaultDependencies,
): (signal?: AbortSignal) => Promise<DaemonSelectionEnsureResult> {
  // Same-process callers share one ensure per canonical runtime; each caller
  // keeps its own cancellation while the shared work runs to completion.
  // Cross-process convergence comes only from retained lifecycle ownership.
  const inFlight = new Map<string, Promise<DaemonSelectionEnsureResult>>()

  const run = async (): Promise<DaemonSelectionEnsureResult> => {
    const status = await dependencies.status()
    if (status.status === 'unsupported') return { status: 'unsupported' }
    if (status.status === 'running') {
      const selected = dependencies.select()
      if (selected) {
        return { status: 'selected', selection: selected, started: false }
      }
    }

    const started = await dependencies.start()
    const selected = dependencies.select()
    if (!selected) {
      throw unavailable(
        'The local daemon became ready without publishing compatible discovery metadata.',
      )
    }
    return {
      status: 'selected',
      selection: selected,
      started: started.started,
    }
  }

  return async (signal) => {
    throwIfCancelled(signal)
    await dependencies.assertInitialized()
    throwIfCancelled(signal)
    const key = dependencies.runtimeKey()
    let pending = inFlight.get(key)
    if (!pending) {
      const started = run()
      pending = started
      inFlight.set(key, started)
      const settle = () => {
        if (inFlight.get(key) === started) inFlight.delete(key)
      }
      started.then(settle, settle)
    }
    return waitForEnsure(pending, signal)
  }
}

export const ensureDaemonSelection = createDaemonSelectionEnsurer()

export interface DaemonRouteSelector {
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly selectDaemon: () => DaemonSelection | null
}

export function selectEnsuredDaemonRoute(
  route: DaemonRouteSelector,
  signal?: AbortSignal,
): Promise<DaemonSelection | null> {
  return resolveEnsuredDaemonSelection(
    route.ensureDaemonSelection,
    route.selectDaemon,
    signal,
  )
}

export async function resolveEnsuredDaemonSelection(
  ensure: typeof ensureDaemonSelection | undefined,
  select: () => DaemonSelection | null,
  signal?: AbortSignal,
): Promise<DaemonSelection | null> {
  if (!ensure) return select()
  const result = await ensure(signal)
  if (result.status !== 'selected') return null
  const reconnect = async (
    retrySignal?: AbortSignal,
  ): Promise<DaemonSelection> => {
    const retried = await ensure(retrySignal)
    if (retried.status !== 'selected') {
      throw unavailable('The local daemon is unsupported on this platform.')
    }
    return registerDaemonReconnect(retried.selection, reconnect)
  }
  return registerDaemonReconnect(result.selection, reconnect)
}
