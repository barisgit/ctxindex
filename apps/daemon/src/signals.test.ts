import { expect, spyOn, test } from 'bun:test'
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

test('graceful shutdown rejection is bounded and handled', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  try {
    const handler = createSignalHandler({
      close: async () => {
        throw new Error('private shutdown canary')
      },
    })
    handler('SIGINT')
    await Promise.resolve()
    await Promise.resolve()
    expect(error).toHaveBeenCalledWith(
      'Daemon shutdown failed; ownership may remain held until the process is force-terminated.',
    )
    expect(String(error.mock.calls[0]?.[0])).not.toContain('canary')
  } finally {
    error.mockRestore()
  }
})
