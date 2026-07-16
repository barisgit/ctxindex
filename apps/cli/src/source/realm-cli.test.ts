import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '@ctxindex/adapters'
import type { Logger } from '@ctxindex/core/logger'
import { createRealmService } from '@ctxindex/core/realm'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import { createSourceService } from '@ctxindex/core/source'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')

async function spawnCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, cliBin, ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { exitCode, stdout, stderr }
}

// ---------------------------------------------------------------------------
// Unit-level tests (direct function calls, no subprocess)
// ---------------------------------------------------------------------------

describe('realm-cli unit: sourceAdd realm semantics', () => {
  const logger = { debug() {} } as unknown as Logger
  const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)

  async function freshDb(): Promise<Database> {
    const db = new Database(':memory:', { create: true })
    applyPragmas(db)
    await runMigrations(db)
    return db
  }

  test('omitting realm fails without creating a global Realm', async () => {
    const db = await freshDb()
    const sourceService = createSourceService({ db, logger, registry })

    expect(() =>
      sourceService.addSource({ adapterId: 'local.directory' }),
    ).toThrow('explicit Realm')
    expect(db.prepare('SELECT count(*) AS count FROM realms').get()).toEqual({
      count: 0,
    })
    db.close()
  })

  test('unknown realm throws with exit code 2 and exact message', async () => {
    const db = await freshDb()
    const sourceService = createSourceService({ db, logger, registry })
    let thrown: unknown
    try {
      sourceService.addSource({
        adapterId: 'local.directory',
        realmSlug: 'unknown',
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(Error)
    const e = thrown as Error & { code?: string }
    expect(e.message).toBe(
      'unknown realm "unknown"; create it with: ctxindex realm add unknown',
    )
    expect(e.code).toBe('unknown_realm')
    db.close()
  })

  test('realm add work then source add --realm work succeeds', async () => {
    const db = await freshDb()
    const realmService = createRealmService({ db, logger })
    const sourceService = createSourceService({
      db,
      logger,
      realmService,
      registry,
    })
    realmService.createRealm({ slug: 'work' })
    const { sourceId } = sourceService.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: '{"root_path":"/tmp"}',
    })
    const row = db
      .prepare(
        'SELECT r.slug FROM sources s JOIN realms r ON r.id = s.realm_id WHERE s.id = ?',
      )
      .get(sourceId) as { slug: string } | null
    expect(row?.slug).toBe('work')
    db.close()
  })
})

// ---------------------------------------------------------------------------
// CLI integration tests (subprocess)
// ---------------------------------------------------------------------------

describe('realm-cli integration: CLI subprocess', () => {
  async function mkSandbox(): Promise<{
    dir: string
    env: Record<string, string>
    cleanup: () => Promise<void>
  }> {
    const dir = await mkdtemp(join(tmpdir(), 'ctxindex-realm-cli-'))
    const env = {
      XDG_CONFIG_HOME: join(dir, 'config'),
      XDG_DATA_HOME: join(dir, 'data'),
      XDG_STATE_HOME: join(dir, 'state'),
      XDG_CACHE_HOME: join(dir, 'cache'),
      CTXINDEX_CONFIG_HOME: undefined as unknown as string,
      CTXINDEX_DATA_HOME: undefined as unknown as string,
      CTXINDEX_STATE_HOME: undefined as unknown as string,
      CTXINDEX_CACHE_HOME: undefined as unknown as string,
    }
    await mkdir(join(dir, 'config'), { recursive: true })
    await mkdir(join(dir, 'data'), { recursive: true })
    // Init the DB
    await spawnCli(['init'], env)
    return {
      dir,
      env,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  }

  test('source add without --realm fails explicitly', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stdout, stderr } = await spawnCli(
        ['source', 'add', 'local.directory', '--root', '/tmp'],
        env,
      )
      expect(exitCode).toBe(2)
      expect(stdout).toBe('')
      expect(stderr).toContain('explicit Realm')
    } finally {
      await cleanup()
    }
  })

  test('source add --realm unknown exits 2 with exact message', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const { exitCode, stderr } = await spawnCli(
        [
          'source',
          'add',
          'local.directory',
          '--realm',
          'unknown',
          '--root',
          '/tmp',
        ],
        env,
      )
      expect(exitCode).toBe(2)
      expect(stderr.trim()).toBe(
        'unknown realm "unknown"; create it with: ctxindex realm add unknown',
      )
    } finally {
      await cleanup()
    }
  })

  test('realm add work then source add --realm work succeeds', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      const addRealm = await spawnCli(['realm', 'add', 'work'], env)
      expect(addRealm.exitCode).toBe(0)

      const addSource = await spawnCli(
        [
          'source',
          'add',
          'local.directory',
          '--realm',
          'work',
          '--root',
          '/tmp',
        ],
        env,
      )
      expect(addSource.stderr).toBe('')
      expect(addSource.exitCode).toBe(0)
      expect(addSource.stdout).toMatch(/source added:/)
    } finally {
      await cleanup()
    }
  })

  test('no TTY prompt: source add with explicit Realm and no stdin runs cleanly', async () => {
    const { env, cleanup } = await mkSandbox()
    try {
      expect((await spawnCli(['realm', 'add', 'work'], env)).exitCode).toBe(0)
      const proc = Bun.spawn(
        [
          process.execPath,
          cliBin,
          'source',
          'add',
          'local.directory',
          '--realm',
          'work',
          '--root',
          '/tmp',
        ],
        {
          cwd: repoRoot,
          env: { ...process.env, ...env },
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: null, // closed stdin — must not hang
        },
      )
      const exitCode = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('timeout: CLI hung waiting for input')),
            5000,
          ),
        ),
      ])
      expect(exitCode).toBe(0)
    } finally {
      await cleanup()
    }
  })
})
