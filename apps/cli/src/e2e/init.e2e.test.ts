import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readConfig } from '@ctxindex/core/config'
import { applyPragmas } from '@ctxindex/core/storage'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

async function expectDir(path: string): Promise<void> {
  expect((await stat(path)).isDirectory()).toBe(true)
}

async function expectFile(path: string): Promise<void> {
  expect((await stat(path)).isFile()).toBe(true)
}

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function pragmaValue(database: Database, pragma: string): unknown {
  const row = database.prepare(`PRAGMA ${pragma}`).get() as Record<
    string,
    unknown
  >
  return Object.values(row)[0]
}

function realmCount(sandbox: Sandbox): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db.prepare('SELECT COUNT(*) AS count FROM realms').get() as {
      count: number
    }
    return row.count
  } finally {
    db.close()
  }
}

function expectSqlitePragmas(sandbox: Sandbox): void {
  const db = new Database(dbPath(sandbox))
  applyPragmas(db)
  try {
    expect(pragmaValue(db, 'journal_mode')).toBe('wal')
    expect(pragmaValue(db, 'foreign_keys')).toBe(1)
  } finally {
    db.close()
  }
}

test('database-backed commands require init while help and init remain available', async () => {
  const sandbox = await createSandbox()
  try {
    const realms = await sandbox.run(['realm', 'list', '--format', 'json'])
    expect(realms.exitCode).toBe(2)
    expect(realms.stderr).toContain(
      'ctxindex is not initialized; run ctxindex init',
    )
    expect(await Bun.file(dbPath(sandbox)).exists()).toBe(false)

    const help = await sandbox.run(['oauth-app', '--help'])
    expect(help.exitCode, help.stderr).toBe(0)
    expect(await Bun.file(dbPath(sandbox)).exists()).toBe(false)

    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    expect(await Bun.file(dbPath(sandbox)).exists()).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})

test('init creates layout', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['init'])

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('ctxindex initialized')

    await expectDir(sandbox.env.CTXINDEX_CONFIG_HOME)
    await expectDir(sandbox.env.CTXINDEX_DATA_HOME)
    await expectDir(sandbox.env.CTXINDEX_STATE_HOME)
    await expectDir(sandbox.env.CTXINDEX_CACHE_HOME)
    await expectDir(join(sandbox.env.CTXINDEX_STATE_HOME, 'logs'))
    await expectFile(join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'))
    await expectFile(dbPath(sandbox))
    expectSqlitePragmas(sandbox)

    expect(await mode(join(sandbox.env.CTXINDEX_STATE_HOME, 'logs'))).toBe(
      0o700,
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('fresh init persists file backend with private key when Keychain is unavailable', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['init'], {
      env: {
        CTXINDEX_KEYTAR_MOCK_FILE: join(
          sandbox.dir,
          'missing-parent',
          'keytar.json',
        ),
      },
    })

    expect(result.exitCode).toBe(0)
    expect(
      await readConfig(join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')),
    ).toMatchObject({ secrets: { backend: 'file' } })
    const keyPath = join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key')
    await expectFile(keyPath)
    expect(await mode(keyPath)).toBe(0o600)

    const second = await sandbox.run(['init'])
    expect(second.exitCode).toBe(0)
    expect(
      await readConfig(join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')),
    ).toMatchObject({ secrets: { backend: 'file' } })
    expect(
      await Bun.file(sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE ?? '').exists(),
    ).toBe(false)
  } finally {
    await sandbox.cleanup()
  }
})

test('init creates XDG dirs', async () => {
  const sandbox = await createSandbox()
  const xdgConfig = join(sandbox.dir, 'xdg-config')
  const xdgData = join(sandbox.dir, 'xdg-data')
  const xdgState = join(sandbox.dir, 'xdg-state')
  const xdgCache = join(sandbox.dir, 'xdg-cache')

  try {
    const result = await sandbox.run(['init'], {
      env: {
        CTXINDEX_CONFIG_HOME: undefined,
        CTXINDEX_DATA_HOME: undefined,
        CTXINDEX_STATE_HOME: undefined,
        CTXINDEX_CACHE_HOME: undefined,
        XDG_CONFIG_HOME: xdgConfig,
        XDG_DATA_HOME: xdgData,
        XDG_STATE_HOME: xdgState,
        XDG_CACHE_HOME: xdgCache,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')

    await expectDir(join(xdgConfig, 'ctxindex'))
    await expectDir(join(xdgData, 'ctxindex'))
    await expectDir(join(xdgState, 'ctxindex'))
    await expectDir(join(xdgCache, 'ctxindex'))
    await expectDir(join(xdgState, 'ctxindex', 'logs'))
    await expectFile(join(xdgConfig, 'ctxindex', 'config.toml'))
    await expectFile(join(xdgData, 'ctxindex', 'ctxindex.sqlite'))
  } finally {
    await sandbox.cleanup()
  }
})

test('init creates no realms', async () => {
  const sandbox = await createSandbox()
  try {
    const result = await sandbox.run(['init'])

    expect(result.exitCode).toBe(0)
    expect(realmCount(sandbox)).toBe(0)
  } finally {
    await sandbox.cleanup()
  }
})

test('init idempotent on re-run', async () => {
  const sandbox = await createSandbox()
  try {
    const first = await sandbox.run(['init'])
    const second = await sandbox.run(['init'])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    expect(second.stderr).toBe('')
    expect(realmCount(sandbox)).toBe(0)
  } finally {
    await sandbox.cleanup()
  }
})

test('init respects CTXINDEX_*_HOME', async () => {
  const sandbox = await createSandbox()
  const configHome = join(sandbox.dir, 'custom-config')
  const dataHome = join(sandbox.dir, 'custom-data')
  const stateHome = join(sandbox.dir, 'custom-state')
  const cacheHome = join(sandbox.dir, 'custom-cache')

  try {
    const result = await sandbox.run(['init'], {
      env: {
        CTXINDEX_CONFIG_HOME: configHome,
        CTXINDEX_DATA_HOME: dataHome,
        CTXINDEX_STATE_HOME: stateHome,
        CTXINDEX_CACHE_HOME: cacheHome,
      },
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')

    await expectFile(join(configHome, 'config.toml'))
    await expectFile(join(dataHome, 'ctxindex.sqlite'))
    await expectDir(join(stateHome, 'logs'))
    await expectDir(cacheHome)
    expect(
      existsSync(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)
  } finally {
    await sandbox.cleanup()
  }
})
