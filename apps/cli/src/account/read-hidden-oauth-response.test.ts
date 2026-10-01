import { expect, test } from 'bun:test'
import { PassThrough } from 'node:stream'
import { readHiddenOAuthResponse } from './read-hidden-oauth-response'

test('raw Ctrl-C cancels the owning Account request and restores terminal mode', async () => {
  const stdin = new PassThrough() as PassThrough & {
    isTTY: true
    isRaw: boolean
    setRawMode(value: boolean): void
  }
  stdin.isTTY = true
  stdin.isRaw = false
  const rawModes: boolean[] = []
  stdin.setRawMode = (value) => {
    stdin.isRaw = value
    rawModes.push(value)
  }
  const stdout = new PassThrough()
  let cancellations = 0
  const pending = readHiddenOAuthResponse(
    {
      signal: new AbortController().signal,
      onCancel: () => {
        cancellations += 1
      },
    },
    {
      stdin: stdin as unknown as typeof process.stdin,
      stdout,
    },
  )
  stdin.write(Buffer.from([3]))
  await expect(pending).resolves.toBeUndefined()
  expect(cancellations).toBe(1)
  expect(rawModes).toEqual([true, false])
})
