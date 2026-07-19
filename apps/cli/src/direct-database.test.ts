import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import {
  acquireFileLease,
  type FileLease,
  FileLeaseConflictError,
} from '@ctxindex/local-daemon'
import {
  initializeDirectStorage,
  openLeasedDatabase,
  PrototypeUnsupportedError,
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
  const exclusive = acquireFileLease({
    canonicalTarget: target,
    purpose: 'database',
    mode: 'exclusive',
  })
  try {
    await expect(
      readLeasedLocalOAuthAppIdentities(target),
    ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
  } finally {
    exclusive.release()
    await rm(root, { recursive: true, force: true })
  }
})

test('local OAuth App identity reads acquire before checking a missing database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-identities-race-'))
  const target = join(await realpath(root), 'ctxindex.sqlite')
  const exclusive = acquireFileLease({
    canonicalTarget: target,
    purpose: 'database',
    mode: 'exclusive',
  })
  try {
    expect(await Bun.file(target).exists()).toBe(false)
    await expect(
      readLeasedLocalOAuthAppIdentities(target),
    ).rejects.toBeInstanceOf(PrototypeUnsupportedError)
  } finally {
    exclusive.release()
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
    expect(await readLeasedLocalOAuthAppIdentities(target)).toEqual([])
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
