import {
  type DaemonLifecycle,
  daemonStart,
  daemonStatus,
  daemonStop,
} from '../daemon/lifecycle'
import {
  acquireDirectDatabaseOwnership,
  type DirectDatabaseOwnership,
} from '../direct-database'

export interface ExtensionMutationCoordinatorDependencies {
  readonly status: DaemonLifecycle['status']
  readonly stop: DaemonLifecycle['stop']
  readonly start: DaemonLifecycle['start']
  readonly acquireOwnership: () => DirectDatabaseOwnership
}

export type ExtensionMutationCoordinator = <T>(
  operation: () => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>

const defaultDependencies: ExtensionMutationCoordinatorDependencies = {
  status: daemonStatus,
  stop: daemonStop,
  start: daemonStart,
  acquireOwnership: acquireDirectDatabaseOwnership,
}

export function createExtensionMutationCoordinator(
  dependencies: ExtensionMutationCoordinatorDependencies = defaultDependencies,
): ExtensionMutationCoordinator {
  return async <T>(operation: () => Promise<T>, signal?: AbortSignal) => {
    const initial = await dependencies.status(signal)
    const restoreDaemon = initial.status === 'running'
    if (initial.status !== 'stopped' && initial.status !== 'unsupported') {
      await dependencies.stop(signal)
    }

    let result!: T
    let operationFailed = false
    let operationFailure: unknown
    let ownership: DirectDatabaseOwnership | undefined
    try {
      ownership = dependencies.acquireOwnership()
      result = await operation()
    } catch (error) {
      operationFailed = true
      operationFailure = error
    } finally {
      ownership?.close()
    }

    if (restoreDaemon) {
      try {
        await dependencies.start()
      } catch (error) {
        if (!operationFailed) throw error
      }
    }
    if (operationFailed) throw operationFailure
    return result
  }
}

export const coordinateExtensionMutation = createExtensionMutationCoordinator()
