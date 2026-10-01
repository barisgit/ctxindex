import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  createFileLeaseBackend,
  type FileLease,
  FileLeaseConflictError,
  type FileLeaseRequest,
  FileLeaseUnsupportedError,
} from '@ctxindex/local-daemon'
import {
  DirectDatabaseLeaseConflictError,
  initializeDirectStorage,
  openLeasedDatabase,
  readLeasedDirectExtensionSourceBindings,
  readLeasedLocalOAuthAppIdentities,
} from './direct-database'
import { mapErrorToExit } from './format/exit'

test('retains the shared lease from before open until after database close', async () => {
  const events: string[] = []
  const lease = {
    mode: 'shared',
    targetDigest: 'a'.repeat(64),
    release: () => events.push('release'),
  } satisfies FileLease
  const db = {
    close: () => events.push('close'),
  } as unknown as CtxindexDatabase

  const runtime = await openLeasedDatabase({
    target: '/tmp/ctxindex-cli-lease.sqlite',
    acquire: () => {
      events.push('acquire')
      return lease
    },
    assertTarget: () => events.push('assert'),
    open: async () => {
      events.push('open')
      return db
    },
    migrate: async () => {
      events.push('migrate')
    },
  })

  expect(events).toEqual(['acquire', 'assert', 'open', 'assert', 'migrate'])
  runtime.close()
  expect(events).toEqual([
    'acquire',
    'assert',
    'open',
    'assert',
    'migrate',
    'close',
    'release',
  ])
})

test('maps exclusive ownership to a holder-neutral database lease conflict before database open', async () => {
  const target = '/tmp/ctxindex-cli-conflict.sqlite'
  const databaseDigest = createHash('sha256')
    .update(`ctxindex-database-v1|${target}`, 'utf8')
    .digest('hex')
  let opened = false
  let failure: unknown
  try {
    await openLeasedDatabase({
      target,
      acquire: () => {
        throw new FileLeaseConflictError('a'.repeat(64))
      },
      open: async () => {
        opened = true
        return {} as CtxindexDatabase
      },
    })
  } catch (error) {
    failure = error
  }

  expect(failure).toMatchObject({
    constructor: DirectDatabaseLeaseConflictError,
    code: 'database_lease_conflict',
    databaseDigest,
    message: `The database is held by another local process/runtime (database=${databaseDigest}).`,
  })
  expect(mapErrorToExit(failure)).toBe(50)
  expect(String(failure)).not.toContain('daemon')
  expect(String(failure)).not.toContain(target)
  expect(opened).toBe(false)
})

test('unsupported platform keeps direct database behavior because no daemon can own it', async () => {
  const events: string[] = []
  const db = {
    close: () => events.push('close'),
  } as unknown as CtxindexDatabase

  const runtime = await openLeasedDatabase({
    target: '/tmp/ctxindex-cli-unsupported-platform.sqlite',
    acquire: () => {
      events.push('unsupported')
      throw new FileLeaseUnsupportedError('platform')
    },
    assertTarget: () => events.push('assert'),
    open: async () => {
      events.push('open')
      return db
    },
    migrate: async () => {
      events.push('migrate')
    },
  })

  expect(events).toEqual(['unsupported', 'open', 'migrate'])
  runtime.close()
  expect(events).toEqual(['unsupported', 'open', 'migrate', 'close'])
})

test('unsupported Darwin filesystem still fails closed before database open', async () => {
  let opened = false
  await expect(
    openLeasedDatabase({
      target: '/tmp/ctxindex-cli-unsupported-filesystem.sqlite',
      acquire: () => {
        throw new FileLeaseUnsupportedError('filesystem')
      },
      open: async () => {
        opened = true
        return {} as CtxindexDatabase
      },
    }),
  ).rejects.toMatchObject({ reason: 'filesystem' })
  expect(opened).toBe(false)
})

test('releases the shared lease when database construction fails', async () => {
  const events: string[] = []
  await expect(
    openLeasedDatabase({
      target: '/tmp/ctxindex-cli-open-failure.sqlite',
      acquire: () => ({
        mode: 'shared',
        targetDigest: 'a'.repeat(64),
        release: () => events.push('release'),
      }),
      assertTarget: () => events.push('assert'),
      open: async () => {
        events.push('open')
        throw new Error('open failed')
      },
    }),
  ).rejects.toThrow('open failed')
  expect(events).toEqual(['assert', 'open', 'release'])
})

test('local OAuth App identity reads fail closed behind exclusive ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-identities-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  await Bun.write(target, '')
  try {
    await expect(
      readLeasedLocalOAuthAppIdentities(target, {
        acquire: () => {
          throw new FileLeaseConflictError('a'.repeat(64))
        },
      }),
    ).rejects.toBeInstanceOf(DirectDatabaseLeaseConflictError)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('local OAuth App identity reads acquire before checking a missing database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-identities-race-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  try {
    expect(await Bun.file(target).exists()).toBe(false)
    await expect(
      readLeasedLocalOAuthAppIdentities(target, {
        acquire: () => {
          throw new FileLeaseConflictError('a'.repeat(64))
        },
      }),
    ).rejects.toBeInstanceOf(DirectDatabaseLeaseConflictError)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('local OAuth App identity reads do not migrate a partial database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-identities-partial-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  const partial = new Database(target, { create: true })
  partial.exec('CREATE TABLE preserved (id INTEGER PRIMARY KEY)')
  partial.close()

  try {
    expect(
      await readLeasedLocalOAuthAppIdentities(target, {
        acquire: () => ({
          mode: 'shared',
          targetDigest: 'a'.repeat(64),
          release: () => {},
        }),
        assertTarget: () => {},
      }),
    ).toEqual([])
    const verification = new Database(target, { readonly: true })
    expect(
      verification
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'preserved' }])
    verification.close()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Source binding reads retain ownership from before readonly open through close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-sources-lease-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  await Bun.write(target, '')
  const events: string[] = []
  const db = {
    prepare: (sql: string) => ({
      get: () => {
        events.push(`get:${sql}`)
        return { present: 1 }
      },
      all: () => {
        events.push(`all:${sql}`)
        return [{ id: 'source-1', label: 'mail', adapter_id: 'mail.adapter' }]
      },
    }),
    close: () => events.push('close'),
  } as unknown as CtxindexDatabase

  try {
    await expect(
      readLeasedDirectExtensionSourceBindings(target, {
        acquire: () => {
          events.push('acquire')
          return {
            mode: 'shared',
            targetDigest: 'a'.repeat(64),
            release: () => events.push('release'),
          }
        },
        assertTarget: () => events.push('assert'),
        openReadonly: () => {
          events.push('open')
          return db
        },
      }),
    ).resolves.toEqual([
      { id: 'source-1', label: 'mail', adapterId: 'mail.adapter' },
    ])
    expect(events[0]).toBe('acquire')
    expect(events.indexOf('open')).toBeGreaterThan(events.indexOf('acquire'))
    expect(events.indexOf('close')).toBeGreaterThan(events.indexOf('open'))
    expect(events.at(-1)).toBe('release')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Source binding reads fail closed before SQLite open under daemon ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-sources-conflict-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  await Bun.write(target, '')
  let opened = false
  try {
    await expect(
      readLeasedDirectExtensionSourceBindings(target, {
        acquire: () => {
          throw new FileLeaseConflictError('a'.repeat(64))
        },
        openReadonly: () => {
          opened = true
          return {} as CtxindexDatabase
        },
      }),
    ).rejects.toBeInstanceOf(DirectDatabaseLeaseConflictError)
    expect(opened).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('init retains its lease around secret setup and guarded bootstrap', async () => {
  const events: string[] = []
  const lease = {
    mode: 'shared',
    targetDigest: 'a'.repeat(64),
    release: () => events.push('release'),
  } satisfies FileLease

  await initializeDirectStorage({
    acquire: () => {
      events.push('acquire')
      return lease
    },
    initializeSecrets: async () => {
      events.push('secrets')
      return 'file'
    },
    assertTarget: () => events.push('assert'),
    bootstrap: async () => {
      events.push('bootstrap')
    },
  })

  expect(events).toEqual([
    'acquire',
    'secrets',
    'assert',
    'bootstrap',
    'assert',
    'release',
  ])
})

test('init preserves direct bootstrap on an unsupported platform', async () => {
  const events: string[] = []

  await initializeDirectStorage({
    acquire: () => {
      events.push('unsupported')
      throw new FileLeaseUnsupportedError('platform')
    },
    initializeSecrets: async () => {
      events.push('secrets')
      return 'file'
    },
    assertTarget: () => events.push('assert'),
    bootstrap: async () => {
      events.push('bootstrap')
    },
  })

  expect(events).toEqual(['unsupported', 'secrets', 'bootstrap'])
})

// Real backends with injected platform/helper seams: a supported Linux host
// whose flock primitive is unavailable must fail closed, while a genuinely
// unsupported OS keeps the pre-daemon unleased direct behavior.
const linuxWithoutFlock = createFileLeaseBackend({
  platform: 'linux',
  resolveFlock: () => null,
})

function acquireOnUnsupportedOs(input: FileLeaseRequest): FileLease {
  return createFileLeaseBackend({ platform: 'win32' }).acquire(input)
}

async function privateDirectory(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'ctxindex-direct-primitive-')))
}

test('a missing Linux flock helper fails closed before the SQLite file is created', async () => {
  const dir = await privateDirectory()
  const target = join(dir, 'ctxindex.sqlite')
  try {
    let failure: unknown
    try {
      const runtime = await openLeasedDatabase({
        target,
        acquire: (input) => linuxWithoutFlock.acquire(input),
      })
      runtime.close()
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(failure).toMatchObject({ reason: 'primitive' })
    expect(mapErrorToExit(failure)).toBe(50)
    expect(existsSync(target)).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('init fails closed before bootstrap when the Linux flock helper is missing', async () => {
  const dir = await privateDirectory()
  const keys = [
    'CTXINDEX_CONFIG_HOME',
    'CTXINDEX_DATA_HOME',
    'CTXINDEX_STATE_HOME',
    'CTXINDEX_CACHE_HOME',
  ] as const
  const saved = keys.map((key) => process.env[key])
  for (const key of keys) process.env[key] = join(dir, key)
  const events: string[] = []
  try {
    await expect(
      initializeDirectStorage({
        acquire: (input) => linuxWithoutFlock.acquire(input),
        initializeSecrets: async () => {
          events.push('secrets')
          return 'file'
        },
        bootstrap: async () => {
          events.push('bootstrap')
        },
      }),
    ).rejects.toMatchObject({ reason: 'primitive' })
    expect(events).toEqual([])
  } finally {
    keys.forEach((key, index) => {
      const value = saved[index]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
    await rm(dir, { recursive: true, force: true })
  }
})

test('an unsupported OS keeps unleased direct database behavior', async () => {
  const dir = await privateDirectory()
  const target = join(dir, 'ctxindex.sqlite')
  try {
    const runtime = await openLeasedDatabase({
      target,
      acquire: acquireOnUnsupportedOs,
    })
    runtime.close()

    expect(existsSync(target)).toBe(true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
