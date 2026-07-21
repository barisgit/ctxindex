import { createInterface } from 'node:readline'

const prompt = 'Paste the redirect URL or authorization code here: '

export function readHiddenOAuthResponse(input: {
  readonly signal: AbortSignal
}): Promise<string | undefined> {
  const stdin = process.stdin
  const stdout = process.stdout

  return new Promise((resolve) => {
    let finished = false
    const wasRaw = stdin.isRaw
    const interactive = stdin.isTTY && typeof stdin.setRawMode === 'function'
    const lines = createInterface({ input: stdin, terminal: false })

    const finish = (value?: string) => {
      if (finished) return
      finished = true
      input.signal.removeEventListener('abort', onAbort)
      lines.close()
      if (interactive) stdin.setRawMode(Boolean(wasRaw))
      stdout.write('\n')
      resolve(value)
    }
    const onAbort = () => finish()
    input.signal.addEventListener('abort', onAbort, { once: true })
    if (input.signal.aborted) return finish()

    stdout.write(prompt)
    if (interactive) stdin.setRawMode(true)
    lines.once('line', (line) => finish(line))
    lines.once('close', () => finish())
  })
}
