import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import { FileLeaseUnsupportedError } from '@ctxindex/local-daemon'
import {
  type DaemonStartupFailure,
  isDaemonStartupFailure,
  startDaemon,
} from './runtime'
import { installSignalHandlers } from './signals'

type StartDaemon = typeof startDaemon

export async function main(start: StartDaemon = startDaemon): Promise<void> {
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
    if (!isDaemonStartupFailure(error)) throw error
    console.error(formatStartupFailure(error))
    return 50
  }
}

if (import.meta.main) {
  process.exitCode = await runForegroundMain()
}
