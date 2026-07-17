import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  type RetrieveContext,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { CtxindexError } from '../errors'
import { createExtensionRegistry, type ExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { SyncCoordinator } from '../sync/sync-coordinator'
import { getSourceResource } from './retrieve'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const ref = `ctx://${sourceId}/item/one`
const profile = defineProfile({
  id: 'fake.item',
  version: 1,
  schema: z.object({ text: z.string() }),
  search: {
    title: (payload) => payload.text,
    chunks: (payload) => [payload.text],
  },
})
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('not used')
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []

function registryWith(
  retrieve?: (context: RetrieveContext) => void | Promise<void>,
): ExtensionRegistry {
  const common = {
    id: 'fake.retrieve',
    version: 1,
    configSchema: z.object({}).strict(),
    auth: { kind: 'none' as const },
    profiles: [{ id: 'fake.item', version: 1 }] as const,
    routing: 'indexed' as const,
    actions: {},
  }
  const adapter = retrieve
    ? defineAdapter({
        ...common,
        capabilities: ['retrieve'],
        operations: { retrieve },
      })
    : defineAdapter({ ...common, capabilities: [], operations: {} })
  return createExtensionRegistry([
    defineExtension({
      id: 'fake.retrieve-extension',
      version: 1,
      profiles: [profile],
      adapters: [adapter],
    }),
  ])
}

async function freshDb(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, adapter_version, label, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'fake.retrieve', 1, ?, '{}', 1, 1, 1)`,
  ).run(sourceId, sourceId)
  return db
}

function input(
  db: Database,
  registry: ExtensionRegistry,
  signal = new AbortController().signal,
) {
  return { db, ref, registry, authService, logger, signal }
}

function emitComplete(
  context: RetrieveContext,
  text = 'provider complete',
): void {
  context.emitResource({
    ref: context.ref,
    profile: { id: 'fake.item', version: 1 },
    payload: { text },
  })
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('getSourceResource', () => {
  test('returns a complete local cache hit without invoking the provider', async () => {
    const db = await freshDb()
    let calls = 0
    const registry = registryWith(() => {
      calls += 1
    })
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: 'fake.item', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'cached' },
    })

    const result = await getSourceResource(input(db, registry))

    expect(calls).toBe(0)
    expect(result.warnings).toEqual([])
    expect(result.resource).toMatchObject({
      ref,
      realmId: 'realm-1',
      profile: { id: 'fake.item', version: 1 },
      origin: 'adhoc',
      title: 'cached',
      hydratedAt: expect.any(Number),
      payload: { text: 'cached' },
    })
  })

  test('retrieves and persists a cache miss only after one valid emission', async () => {
    const db = await freshDb()
    const registry = registryWith((context) => emitComplete(context))

    const result = await getSourceResource(input(db, registry))

    expect(result.warnings).toEqual([])
    expect(result.resource).toMatchObject({
      ref,
      origin: 'adhoc',
      hydratedAt: expect.any(Number),
      payload: { text: 'provider complete' },
    })
    expect(new ResourceStore(db, registry.profiles).get(ref)).toEqual(
      result.resource,
    )
  })

  test('retrieves a partial synced cache and keeps its synced origin', async () => {
    const db = await freshDb()
    const registry = registryWith((context) => emitComplete(context))
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'partial',
      payload: { text: 'partial' },
    })

    const result = await getSourceResource(input(db, registry))

    expect(result.resource).toMatchObject({
      origin: 'synced',
      hydratedAt: expect.any(Number),
      payload: { text: 'provider complete' },
    })
  })

  test('returns a local tombstone exactly and never invokes the provider', async () => {
    const db = await freshDb()
    let calls = 0
    const registry = registryWith(() => {
      calls += 1
    })
    const store = new ResourceStore(db, registry.profiles)
    store.upsert({
      ref,
      sourceId,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { text: 'deleted' },
    })
    store.remove({ ref, sourceId, deletedAt: 123 })

    const result = await getSourceResource(input(db, registry))

    expect(calls).toBe(0)
    expect(store.get(ref, { includeDeleted: true })).toEqual(result.resource)
    expect(result.resource.deletedAt).toBe(123)
  })

  test.each([
    ['zero', async () => {}],
    [
      'multiple',
      async (context: RetrieveContext) => {
        emitComplete(context, 'first')
        emitComplete(context, 'second')
      },
    ],
    [
      'mismatched Ref',
      async (context: RetrieveContext) => {
        context.emitResource({
          ref: `ctx://${sourceId}/item/other`,
          profile: { id: 'fake.item', version: 1 },
          payload: { text: 'wrong' },
        })
      },
    ],
    [
      'missing payload',
      async (context: RetrieveContext) => {
        context.emitResource({
          ref: context.ref,
          profile: { id: 'fake.item', version: 1 },
        } as never)
      },
    ],
  ])('rejects %s emissions without persisting them', async (_label, retrieve) => {
    const db = await freshDb()
    const registry = registryWith(retrieve)

    const error = await getSourceResource(input(db, registry)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(CtxindexError)
    expect(error).toMatchObject({ code: 'invalid_retrieve_result' })
    expect(new ResourceStore(db, registry.profiles).get(ref)).toBeNull()
  })

  test('rejects an Adapter without retrieve capability', async () => {
    const db = await freshDb()
    const registry = registryWith()

    const error = await getSourceResource(input(db, registry)).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(CtxindexError)
    expect(error).toMatchObject({ code: 'retrieve_unsupported' })
  })

  test('passes cancellation through and persists nothing', async () => {
    const db = await freshDb()
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))
    let seen: AbortSignal | undefined
    const registry = registryWith((context) => {
      seen = context.signal
      context.signal.throwIfAborted()
    })

    const error = await getSourceResource(
      input(db, registry, controller.signal),
    ).catch((caught: unknown) => caught)

    expect(seen).toBe(controller.signal)
    expect(error).toMatchObject({ name: 'AbortError' })
    expect(new ResourceStore(db, registry.profiles).get(ref)).toBeNull()
  })

  test('degrades an unknown retrieved Profile to envelope-only with a warning', async () => {
    const db = await freshDb()
    const registry = registryWith((context) => {
      context.emitResource({
        ref: context.ref,
        profile: { id: 'missing.item', version: 2 },
        title: 'Envelope',
        payload: { unsafe: true },
      })
    })

    const result = await getSourceResource(input(db, registry))

    expect(result.resource).toMatchObject({
      profile: { id: 'missing.item', version: 2 },
      title: 'Envelope',
      hydratedAt: expect.any(Number),
      payload: null,
    })
    expect(result.warnings).toEqual([
      {
        code: 'unknown_profile_version',
        message:
          'Resource ctx://01KXHBNECDAH1T4MJ38X88EPFJ/item/one uses unavailable Profile missing.item@2',
        ref,
      },
    ])
  })

  test('converges get then partial sync without content loss', async () => {
    const db = await freshDb()
    const registry = registryWith((context) => emitComplete(context))
    const hydrated = await getSourceResource(input(db, registry))

    await new SyncCoordinator(db, registry.profiles).run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({
          type: 'upsertResource',
          resource: {
            ref,
            profile: { id: 'fake.item', version: 1 },
            completeness: 'partial',
            providerUpdatedAt: 456,
            payload: { text: 'sync envelope' },
          },
        })
      },
    )

    expect(new ResourceStore(db, registry.profiles).get(ref)).toMatchObject({
      origin: 'synced',
      hydratedAt: hydrated.resource.hydratedAt,
      providerUpdatedAt: 456,
      payload: { text: 'provider complete' },
    })
  })

  test('converges partial sync then get into complete synced content', async () => {
    const db = await freshDb()
    const registry = registryWith((context) => emitComplete(context))
    await new SyncCoordinator(db, registry.profiles).run(
      { sourceId, mode: 'sync', signal: new AbortController().signal },
      async ({ emit }) => {
        await emit({
          type: 'upsertResource',
          resource: {
            ref,
            profile: { id: 'fake.item', version: 1 },
            completeness: 'partial',
            payload: { text: 'sync partial' },
          },
        })
      },
    )

    const result = await getSourceResource(input(db, registry))

    expect(result.resource).toMatchObject({
      origin: 'synced',
      hydratedAt: expect.any(Number),
      payload: { text: 'provider complete' },
    })
  })
})
