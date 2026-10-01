import { afterEach, expect, test } from 'bun:test'
import { main, testIdleTimeoutMs } from './main'
import { DAEMON_IDLE_TIMEOUT_MS, type startDaemon } from './runtime'

const variable = 'CTXINDEX_TEST_DAEMON_IDLE_TIMEOUT_MS'
const original = process.env[variable]

afterEach(() => {
  if (original === undefined) delete process.env[variable]
  else process.env[variable] = original
})

test('the production idle lifetime is a fixed five minutes', () => {
  expect(DAEMON_IDLE_TIMEOUT_MS).toBe(5 * 60_000)
})

test('the internal test idle control may only shorten the fixed lifetime', () => {
  expect(testIdleTimeoutMs({})).toBeUndefined()
  expect(testIdleTimeoutMs({ [variable]: '250' })).toBe(250)
  expect(testIdleTimeoutMs({ [variable]: '299999' })).toBe(299_999)
  for (const ignored of [
    '',
    '0',
    '-5',
    '1.5',
    '1e3',
    ' 250',
    'soon',
    '300000',
    '999999999',
  ]) {
    expect(testIdleTimeoutMs({ [variable]: ignored })).toBeUndefined()
  }
})

async function startOptions(): Promise<Parameters<typeof startDaemon>[0]> {
  let observed: Parameters<typeof startDaemon>[0] | undefined
  const start = (async (options) => {
    observed = options
    return { closed: Promise.resolve(), close: async () => ({}) }
  }) as typeof startDaemon
  await main(start)
  if (!observed) throw new Error('Expected daemon startup')
  return observed
}

test('the daemon entry composes the test idle control only when present', async () => {
  delete process.env[variable]
  expect((await startOptions()).idleTimeoutMs).toBeUndefined()

  process.env[variable] = '250'
  expect((await startOptions()).idleTimeoutMs).toBe(250)

  process.env[variable] = 'invalid'
  expect((await startOptions()).idleTimeoutMs).toBeUndefined()
})
