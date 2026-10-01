import { createInterface } from 'node:readline'

const prompt = 'Paste the redirect URL or authorization code here: '

export function readHiddenOAuthResponse(
  input: {
    readonly signal: AbortSignal
    readonly onCancel?: () => void
  },
  io: {
    readonly stdin: typeof process.stdin
    readonly stdout: Pick<typeof process.stdout, 'write'>
  } = { stdin: process.stdin, stdout: process.stdout },
): Promise<string | undefined> {
  const { stdin, stdout } = io

  return new Promise((resolve) => {
    let finished = false
    const wasRaw = stdin.isRaw
    const interactive = stdin.isTTY && typeof stdin.setRawMode === 'function'
    const lines = createInterface({ input: stdin, terminal: false })

    const finish = (value?: string) => {
      if (finished) return
      finished = true
      input.signal.removeEventListener('abort', onAbort)
      stdin.off('data', onData)
      lines.close()
      if (interactive) stdin.setRawMode(Boolean(wasRaw))
      stdout.write('\n')
      resolve(value)
    }
    const onAbort = () => finish()
    const onData = (chunk: Buffer | string) => {
      if (!interactive) return
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      if (!bytes.includes(3)) return
      input.onCancel?.()
      finish()
    }
    input.signal.addEventListener('abort', onAbort, { once: true })
    if (input.signal.aborted) return finish()

    stdout.write(prompt)
    if (interactive) {
      stdin.setRawMode(true)
      stdin.on('data', onData)
    }
    lines.once('line', (line) => finish(line))
    lines.once('close', () => finish())
  })
}
