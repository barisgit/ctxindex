import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import {
  FileLeaseUnsupportedError,
  UnsafeFileLeaseError,
} from '@ctxindex/local-daemon'
import {
  DAEMON_IDLE_TIMEOUT_MS,
  type DaemonStartupFailure,
  isDaemonStartupFailure,
  startDaemon,
} from './runtime'
import { installSignalHandlers } from './signals'

type StartDaemon = typeof startDaemon

/**
 * Internal test-only control that lets compiled journeys observe automatic idle
 * exit without waiting five minutes. It is not user configuration: it can only
 * shorten the fixed production lifetime, and malformed values are ignored.
 */
export function testIdleTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const raw = env.CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS
  if (raw === undefined || !/^[1-9][0-9]{0,8}$/.test(raw)) return undefined
  const value = Number(raw)
  return value < DAEMON_IDLE_TIMEOUT_MS ? value : undefined
}

export async function main(start: StartDaemon = startDaemon): Promise<void> {
  const idleTimeoutMs = testIdleTimeoutMs()
  const daemon = await start({
    roots: {
      configRoot: configDir(),
      dataRoot: dataDir(),
      stateRoot: stateDir(),
      cacheRoot: cacheDir(),
    },
    ...(process.env.CTXINDEX_DAEMON_RUNTIME_ROOT
      ? { endpointRuntimeRoot: process.env.CTXINDEX_DAEMON_RUNTIME_ROOT }
      : {}),
    ...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs }),
  })
  const removeSignals = installSignalHandlers(daemon)
  await daemon.closed
  removeSignals()
}

export function formatStartupFailure(failure: DaemonStartupFailure): string {
  return [failure.message, `database=${failure.databaseDigest}`].join('\t')
}

export async function runForegroundMain(
  start: StartDaemon = startDaemon,
): Promise<number> {
  try {
    await main(start)
    return 0
  } catch (error) {
    if (error instanceof FileLeaseUnsupportedError) {
      console.error(
        'The local daemon is unsupported on this platform or filesystem.',
      )
      return 50
    }
    if (error instanceof UnsafeFileLeaseError) {
      // Lease validation messages are constant and path-free, so they are
      // safe to name in the private startup log as the actionable reason.
      console.error(
        `The local daemon refused an unsafe retained lease: ${error.message}`,
      )
      return 50
    }
    if (!isDaemonStartupFailure(error)) throw error
    console.error(formatStartupFailure(error))
    return 50
  }
}

if (import.meta.main) {
  process.exitCode = await runForegroundMain()
}
