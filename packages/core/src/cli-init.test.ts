import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as TOML from '@iarna/toml'
import { applyPragmas } from './storage/db'

const repoRoot = new URL('../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}

function pragmaValue(database: Database, pragma: string): unknown {
  const row = database.prepare(`PRAGMA ${pragma}`).get() as Record<
    string,
    unknown
  >
  return Object.values(row)[0]
}

async function expectPrivateDir(path: string): Promise<void> {
  expect((await stat(path)).isDirectory()).toBe(true)
  if (process.platform !== 'darwin') {
    expect(await mode(path)).toBe(0o700)
  }
}

test('ctxindex init creates XDG layout, config, sqlite, and PRAGMAs', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-init-'))
  const xdgConfig = join(sandbox, 'config')
  const xdgData = join(sandbox, 'data')
  const xdgState = join(sandbox, 'state')
  const xdgCache = join(sandbox, 'cache')
  const configHome = join(xdgConfig, 'ctxindex')
  const dataHome = join(xdgData, 'ctxindex')
  const stateHome = join(xdgState, 'ctxindex')
  const cacheHome = join(xdgCache, 'ctxindex')

  await mkdir(configHome, { recursive: true })
  await mkdir(dataHome, { recursive: true })
  await writeFile(join(configHome, 'secret.key'), 'not-a-real-secret')
  await writeFile(join(dataHome, 'secrets.box'), 'not-a-real-secret')
  await chmod(join(configHome, 'secret.key'), 0o644)
  await chmod(join(dataHome, 'secrets.box'), 0o644)

  try {
    const proc = Bun.spawn([process.execPath, cliBin, 'init'], {
      cwd: repoRoot,
      env: {
        ...process.env,
        CTXINDEX_CONFIG_HOME: undefined,
        CTXINDEX_DATA_HOME: undefined,
        CTXINDEX_STATE_HOME: undefined,
        CTXINDEX_CACHE_HOME: undefined,
        CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox, 'keytar.json'),
        XDG_CONFIG_HOME: xdgConfig,
        XDG_DATA_HOME: xdgData,
        XDG_STATE_HOME: xdgState,
        XDG_CACHE_HOME: xdgCache,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    })

    const [exitCode, stderrText] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ])
    expect(stderrText).toBe('')
    expect(exitCode).toBe(0)

    await expectPrivateDir(configHome)
    await expectPrivateDir(dataHome)
    await expectPrivateDir(stateHome)
    await expectPrivateDir(cacheHome)
    await expectPrivateDir(join(stateHome, 'logs'))

    if (process.platform !== 'darwin') {
      expect(await mode(join(configHome, 'secret.key'))).toBe(0o600)
      expect(await mode(join(dataHome, 'secrets.box'))).toBe(0o600)
    }

    const configPath = join(configHome, 'config.toml')
    expect(TOML.parse(await Bun.file(configPath).text())).toMatchObject({
      secrets: { backend: 'keychain' },
      log: { level: 'info' },
    })

    const dbPath = join(dataHome, 'ctxindex.sqlite')
    expect(await Bun.file(dbPath).exists()).toBe(true)

    const database = new Database(dbPath)
    applyPragmas(database)
    try {
      expect(pragmaValue(database, 'journal_mode')).toBe('wal')
      expect(pragmaValue(database, 'foreign_keys')).toBe(1)
      expect(pragmaValue(database, 'synchronous')).toBe(1)
      expect(pragmaValue(database, 'busy_timeout')).toBe(5000)
      // TODO(f04): assert the seeded global realm row here after f04 adds
      // migrations and realm seeding to init.
    } finally {
      database.close()
    }
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
})
