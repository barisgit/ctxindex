import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  type FileLease,
  FileLeaseConflictError,
  FileLeaseUnsupportedError,
} from '@ctxindex/local-daemon'
import {
  initializeDirectStorage,
  openLeasedDatabase,
  PrototypeUnsupportedError,
  readLeasedDirectExtensionSourceBindings,
  readLeasedLocalOAuthAppIdentities,
} from './direct-database'

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

test('maps exclusive ownership to prototype unsupported before database open', async () => {
  let opened = false
  await expect(
    openLeasedDatabase({
      target: '/tmp/ctxindex-cli-conflict.sqlite',
      acquire: () => {
        throw new FileLeaseConflictError('a'.repeat(64))
      },
      open: async () => {
        opened = true
        return {} as CtxindexDatabase
      },
    }),
  ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
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
    ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
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
    ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
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
    ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
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
