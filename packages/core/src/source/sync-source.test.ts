import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  type SyncContext,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { createExtensionRegistry } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { syncSource } from './sync-source'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const profile = defineProfile({
  id: 'fake.item',
  version: 1,
  schema: z.object({ text: z.string() }),
})
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('unused')
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []

async function setup(sync?: (context: SyncContext) => void | Promise<void>) {
  const adapter = sync
    ? defineAdapter({
        id: 'fake.sync',
        version: 1,
        configSchema: z.object({ folder: z.string() }).strict(),
        auth: { kind: 'none' },
        providerApiHosts: ['provider.test'],
        profiles: [{ id: 'fake.item', version: 1 }],
        routing: 'indexed',
        capabilities: ['sync'],
        operations: { sync },
        actions: {},
      })
    : defineAdapter({
        id: 'fake.sync',
        version: 1,
        configSchema: z.object({ folder: z.string() }).strict(),
        auth: { kind: 'none' },
        providerApiHosts: ['provider.test'],
        profiles: [{ id: 'fake.item', version: 1 }],
        routing: 'indexed',
        capabilities: [],
        operations: {},
        actions: {},
      })
  const registry = createExtensionRegistry([
    defineExtension({
      id: 'fake.extension',
      version: 1,
      profiles: [profile],
      adapters: [adapter],
    }),
  ])
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.exec("INSERT INTO realms VALUES ('realm-1', 'work', 'Work', 1)")
  db.prepare(
    "INSERT INTO sources (id, realm_id, adapter_id, adapter_version, label, config_json, created_at, updated_at) VALUES (?, 'realm-1', 'fake.sync', 1, ?, ?, 1, 1)",
  ).run(sourceId, sourceId, JSON.stringify({ folder: '/tmp/root' }))
  return { db, registry }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

test('invokes the loaded public Adapter inside the lock with Source-bound context', async () => {
  let fetchCalled = false
  const { db, registry } = await setup(async (context) => {
    expect(
      db.prepare("SELECT scope FROM sync_locks WHERE scope = 'global'").get(),
    ).toEqual({ scope: 'global' })
    expect(context.source).toEqual({
      id: sourceId,
      config: { folder: '/tmp/root' },
    })
    expect(context.mode).toBe('resync')
    expect(context.cursor).toBeNull()
    await context.fetch('https://provider.test/resource')
    await context.emit({
      type: 'upsertResource',
      resource: {
        ref: `ctx://${sourceId}/item/one`,
        profile: { id: 'fake.item', version: 1 },
        completeness: 'complete',
        payload: { text: 'one' },
      },
    })
  })
  const fetch = (async () => {
    fetchCalled = true
    return new Response('ok')
  }) as unknown as typeof globalThis.fetch
  const result = await syncSource({
    db,
    registry,
    authService,
    logger,
    sourceId,
    mode: 'resync',
    signal: new AbortController().signal,
    fetch,
  })
  expect(fetchCalled).toBe(true)
  expect(result.added).toBe(1)
})

test('unsupported sync operation is typed and releases the lock', async () => {
  const { db, registry } = await setup()
  await expect(
    syncSource({
      db,
      registry,
      authService,
      logger,
      sourceId,
      mode: 'sync',
      signal: new AbortController().signal,
    }),
  ).rejects.toEqual(expect.objectContaining({ code: 'sync_unsupported' }))
  expect(db.prepare('SELECT count(*) AS count FROM sync_locks').get()).toEqual({
    count: 0,
  })
})

test('unavailable Adapter is a typed failure', async () => {
  const { db } = await setup()
  const registry = createExtensionRegistry([])
  await expect(
    syncSource({
      db,
      registry,
      authService,
      logger,
      sourceId,
      mode: 'sync',
      signal: new AbortController().signal,
    }),
  ).rejects.toEqual(expect.objectContaining({ code: 'adapter_unavailable' }))
})
