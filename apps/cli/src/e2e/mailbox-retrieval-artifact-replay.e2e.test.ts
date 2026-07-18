import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
  buildCompiledCliHarness,
  type CompiledCliHarness,
  isolatedChildEnvironment,
  mailboxReplayDrivers,
  runMailboxRetrievalArtifactReplay,
} from './_mailbox-retrieval-artifact-replay.test'

let harness: CompiledCliHarness | undefined

test('compiled child environment excludes ambient credential and config keys', () => {
  const ambientKey = 'CTXINDEX_AMBIENT_AUTH_TOKEN'
  const previous = process.env[ambientKey]
  process.env[ambientKey] = 'invented-ambient-canary'
  try {
    const explicit = {
      PATH: '/invented/bin',
      XDG_CONFIG_HOME: '/invented/config',
      CTXINDEX_GMAIL_MOCK_BASE_URL: 'http://127.0.0.1:12345',
    }
    const child = isolatedChildEnvironment(explicit)
    expect(Object.keys(child).sort()).toEqual(Object.keys(explicit).sort())
    expect(Object.hasOwn(child, ambientKey)).toBe(false)
    for (const key of [
      'HOME',
      'AWS_SECRET_ACCESS_KEY',
      'GITHUB_TOKEN',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'CTXINDEX_GOOGLE_REFRESH_TOKEN',
      'CTXINDEX_MICROSOFT_REFRESH_TOKEN',
    ]) {
      expect(Object.hasOwn(child, key)).toBe(false)
    }
  } finally {
    if (previous === undefined) delete process.env[ambientKey]
    else process.env[ambientKey] = previous
  }
})

beforeAll(async () => {
  harness = await buildCompiledCliHarness()
}, 30_000)

afterAll(async () => {
  await harness?.cleanup()
})

for (const driver of mailboxReplayDrivers) {
  test(`compiled CLI replays provider-neutral retrieval and Artifacts for ${driver.adapterId}`, async () => {
    if (!harness) throw new Error('Compiled CLI harness was not initialized')
    await runMailboxRetrievalArtifactReplay(harness, driver)
  }, 60_000)
}
