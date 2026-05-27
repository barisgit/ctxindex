import { expect, test } from 'bun:test'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Sandbox } from './sandbox'
import { createSandbox } from './sandbox'

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

test('run spawns binary', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['--version'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toMatch(/^(ctxindex )?\d+\.\d+\.\d+$/)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  } finally {
    await sandbox.cleanup()
  }
})

test('cleanup removes tmpDir', async () => {
  const sandbox = await createSandbox()
  const dir = sandbox.dir

  expect(await pathExists(dir)).toBe(true)

  await sandbox.cleanup()
  await sandbox.cleanup()

  expect(await pathExists(dir)).toBe(false)
})

test('parallel sandboxes isolated', async () => {
  const sandboxes: Sandbox[] = []

  try {
    const [first, second] = await Promise.all([
      createSandbox(),
      createSandbox(),
    ])
    sandboxes.push(first, second)

    expect(first.dir).not.toBe(second.dir)
    expect(first.env.CTXINDEX_CONFIG_HOME).not.toBe(
      second.env.CTXINDEX_CONFIG_HOME,
    )
    expect(first.env.CTXINDEX_DATA_HOME).not.toBe(second.env.CTXINDEX_DATA_HOME)

    const init = await first.run(['init'])
    expect(init.stderr).toBe('')
    expect(init.exitCode).toBe(0)

    expect(
      await pathExists(join(first.env.CTXINDEX_CONFIG_HOME, 'config.toml')),
    ).toBe(true)
    expect(
      await pathExists(join(first.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(true)
    expect(
      await pathExists(join(second.env.CTXINDEX_CONFIG_HOME, 'config.toml')),
    ).toBe(false)
    expect(
      await pathExists(join(second.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)
  } finally {
    await Promise.allSettled(sandboxes.map((sandbox) => sandbox.cleanup()))
  }
})

test('env does not leak', async () => {
  const leakEnvKey = `${'CTXINDEX_'}FOO`
  const original = process.env[leakEnvKey]
  process.env[leakEnvKey] = 'bar'

  const sandbox = await createSandbox()
  try {
    expect(leakEnvKey in sandbox.env).toBe(false)
    expect(sandbox.env.CTXINDEX_CONFIG_HOME.startsWith(sandbox.dir)).toBe(true)
    expect(sandbox.env.CTXINDEX_DATA_HOME.startsWith(sandbox.dir)).toBe(true)
    expect(sandbox.env.CTXINDEX_CACHE_HOME.startsWith(sandbox.dir)).toBe(true)
    expect(sandbox.env.CTXINDEX_STATE_HOME.startsWith(sandbox.dir)).toBe(true)
  } finally {
    await sandbox.cleanup()
    if (original === undefined) {
      delete process.env[leakEnvKey]
    } else {
      process.env[leakEnvKey] = original
    }
  }
})
