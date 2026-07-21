import { DaemonCliError, type DaemonSelection, selectDaemon } from './client'
import { type DaemonLifecycle, daemonStart, daemonStatus } from './lifecycle'

export type DaemonSelectionEnsureResult =
  | {
      readonly status: 'selected'
      readonly selection: DaemonSelection
      readonly started: boolean
    }
  | { readonly status: 'unsupported' }

export interface DaemonSelectionEnsurerDependencies {
  readonly select: () => DaemonSelection | null
  readonly status: DaemonLifecycle['status']
  readonly start: DaemonLifecycle['start']
}

const defaultDependencies: DaemonSelectionEnsurerDependencies = {
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
  let inFlight: Promise<DaemonSelectionEnsureResult> | undefined

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
    if (!inFlight) {
      const pending = run()
      inFlight = pending
      pending.then(
        () => {
          if (inFlight === pending) inFlight = undefined
        },
        () => {
          if (inFlight === pending) inFlight = undefined
        },
      )
    }
    return waitForEnsure(inFlight, signal)
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
  return result.status === 'selected' ? result.selection : null
}
