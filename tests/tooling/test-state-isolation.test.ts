import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cacheDir, configDir, dataDir, stateDir } from '@ctxindex/core/paths'
import * as TOML from '@iarna/toml'

// Tests must never resolve the developer's real ctxindex runtime: initialized
// registry reads ensure a daemon, so an unisolated test starts a real daemon
// against real user data. `bun test` reads only the bunfig.toml in its cwd, so
// the root and every workspace must preload the isolation script.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const preload = join(repoRoot, 'scripts/testing/isolate-ctxindex-state.ts')

async function bunTestDirectories(): Promise<string[]> {
  const rootPackageJson = JSON.parse(
    await Bun.file(join(repoRoot, 'package.json')).text(),
  ) as { workspaces?: string[] }
  const directories = [repoRoot]
  for (const pattern of rootPackageJson.workspaces ?? []) {
    const parent = join(repoRoot, pattern.replace(/\/\*$/, ''))
    for (const entry of await readdir(parent, { withFileTypes: true })) {
      const directory = join(parent, entry.name)
      const packageJson = Bun.file(join(directory, 'package.json'))
      if (!entry.isDirectory() || !(await packageJson.exists())) continue
      const scripts = (
        JSON.parse(await packageJson.text()) as {
          scripts?: Record<string, string>
        }
      ).scripts
      if (Object.values(scripts ?? {}).some((s) => s.includes('bun test'))) {
        directories.push(directory)
      }
    }
  }
  return directories
}

test('every bun test root preloads isolated ctxindex state', async () => {
  const directories = await bunTestDirectories()
  expect(directories.length).toBeGreaterThan(1)

  for (const directory of directories) {
    const label = relative(repoRoot, directory) || '.'
    const bunfig = Bun.file(join(directory, 'bunfig.toml'))
    expect(await bunfig.exists(), `${label}/bunfig.toml`).toBe(true)
    const parsed = TOML.parse(await bunfig.text()) as {
      test?: { preload?: unknown }
    }
    const preloads = Array.isArray(parsed.test?.preload)
      ? (parsed.test.preload as string[])
      : []
    expect(
      preloads.map((path) => resolve(directory, path)),
      `${label}/bunfig.toml [test] preload`,
    ).toContain(preload)
  }
})

test('test processes resolve ctxindex roots outside the real home', () => {
  for (const path of [configDir(), dataDir(), stateDir(), cacheDir()]) {
    expect(path.startsWith(`${homedir()}/`)).toBe(false)
    expect(path.startsWith(`${tmpdir()}/`)).toBe(true)
  }
})
