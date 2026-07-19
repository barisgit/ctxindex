import type { RunningDaemon } from './runtime'

export function createSignalHandler(
  daemon: Pick<RunningDaemon, 'close'>,
  exit: (code: number) => never = process.exit,
): (signal: NodeJS.Signals) => void {
  let stopping = false
  return (signal) => {
    if (stopping) exit(signal === 'SIGINT' ? 130 : 143)
    stopping = true
    void daemon.close().then((result) => {
      if (result.status === 'timeout') {
        console.error(
          'Daemon shutdown timed out; ownership remains held until work settles or the process is force-terminated.',
        )
      }
    })
  }
}

export function installSignalHandlers(
  daemon: Pick<RunningDaemon, 'close'>,
): () => void {
  const handler = createSignalHandler(daemon)
  process.on('SIGINT', handler)
  process.on('SIGTERM', handler)
  return () => {
    process.removeListener('SIGINT', handler)
    process.removeListener('SIGTERM', handler)
  }
}
