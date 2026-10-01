import { expect, test } from 'bun:test'
import { exists } from 'node:fs/promises'
import { createSandbox } from '@ctxindex/core/testing'

test('malformed search arguments perform zero storage work', async () => {
  const sandbox = await createSandbox()
  try {
    for (const args of [
      ['search', '--field', 'sender=alice@example.com'],
      ['search', 'query', '--kind', 'first', '--kind', 'second'],
    ]) {
      const result = await sandbox.run(args)
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(2)
      expect(result.stdout).toBe('')
      expect(await exists(sandbox.env.CTXINDEX_CONFIG_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_DATA_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_CACHE_HOME)).toBe(false)
      expect(await exists(sandbox.env.CTXINDEX_STATE_HOME)).toBe(false)
    }
  } finally {
    await sandbox.cleanup()
  }
})
