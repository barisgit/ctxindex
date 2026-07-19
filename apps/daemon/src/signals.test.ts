import { expect, test } from 'bun:test'
import { createSignalHandler } from './signals'

test('first termination signal uses graceful shutdown and a repeated signal force-terminates', async () => {
  let closes = 0
  const exits: number[] = []
  const handler = createSignalHandler(
    {
      close: async () => {
        closes += 1
        return { status: 'timeout', instanceId: 'instance', timeoutMs: 1 }
      },
    },
    ((code: number) => {
      exits.push(code)
      throw new Error('forced')
    }) as never,
  )
  handler('SIGTERM')
  await Promise.resolve()
  expect(closes).toBe(1)
  expect(() => handler('SIGTERM')).toThrow('forced')
  expect(exits).toEqual([143])
})
