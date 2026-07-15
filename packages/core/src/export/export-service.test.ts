import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  type AnyProfileDefinition,
  defineAdapter,
  defineExtension,
  defineProfile,
  type RetrieveContext,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { exportSourceResource } from './export-service'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const ref = `ctx://${sourceId}/item/one`
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('not used')
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []

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
       (id, realm_id, adapter_id, adapter_version, config_json, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'fake.export', 1, '{}', 1, 1, 1)`,
  ).run(sourceId)
  return db
}

function registryWith(
  profile?: AnyProfileDefinition,
  retrieve?: (context: RetrieveContext) => void,
) {
  const common = {
    id: 'fake.export',
    version: 1,
    configSchema: z.object({}).strict(),
    auth: { kind: 'none' },
    profiles: profile ? [{ id: profile.id, version: profile.version }] : [],
    routing: 'indexed',
    actions: {},
  } as const
  const adapter = retrieve
    ? defineAdapter({
        ...common,
        capabilities: ['retrieve'],
        operations: { retrieve },
      })
    : defineAdapter({ ...common, capabilities: [], operations: {} })
  return createExtensionRegistry([
    defineExtension({
      id: 'fake.extension',
      version: 1,
      profiles: profile ? [profile] : [],
      adapters: [adapter],
    }),
  ])
}

function exportInput(
  db: Database,
  registry: ReturnType<typeof registryWith>,
  format: string,
) {
  return {
    db,
    ref,
    format,
    registry,
    authService,
    logger,
    signal: new AbortController().signal,
  }
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('exportSourceResource', () => {
  test('exports deterministic compact validated-payload JSON from the hydrated cache', async () => {
    let retrieveCalls = 0
    const profile = defineProfile({
      id: 'fake.item',
      version: 1,
      schema: z.object({
        nested: z.object({ z: z.number(), a: z.number() }),
        list: z.array(z.object({ b: z.number(), a: z.number() })),
      }),
    })
    const adapter = defineAdapter({
      id: 'fake.export',
      version: 1,
      configSchema: z.object({}).strict(),
      auth: { kind: 'none' },
      profiles: [{ id: 'fake.item', version: 1 }],
      routing: 'indexed',
      capabilities: ['retrieve'],
      operations: {
        retrieve() {
          retrieveCalls += 1
        },
      },
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
    const db = await freshDb()
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: 'fake.item', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { list: [{ b: 2, a: 1 }], nested: { z: 2, a: 1 } },
    })

    const result = await exportSourceResource({
      db,
      ref,
      format: 'json',
      registry,
      authService,
      logger,
      signal: new AbortController().signal,
    })

    expect(retrieveCalls).toBe(0)
    expect(result).toEqual({
      bytes: new TextEncoder().encode(
        '{"list":[{"a":1,"b":2}],"nested":{"a":1,"z":2}}',
      ),
      mediaType: 'application/json',
      format: 'json',
      ref,
      warnings: [],
    })
    expect(new TextDecoder().decode(result.bytes)).not.toEndWith('\n')

    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: 'fake.item', version: 1 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { nested: { a: 1, z: 2 }, list: [{ a: 1, b: 2 }] },
    })
    expect(
      (await exportSourceResource(exportInput(db, registry, 'json'))).bytes,
    ).toEqual(result.bytes)
  })

  test('hydrates through the Adapter and invokes the exact Profile renderer with undefined dependencies', async () => {
    const calls: unknown[] = []
    const profile = defineProfile({
      id: 'fake.item',
      version: 2,
      schema: z.object({ text: z.string() }),
      exports: {
        binary: {
          mediaType: 'application/octet-stream',
          render(payload, dependencies) {
            calls.push([payload, dependencies])
            return Uint8Array.of(0, 255, 10)
          },
        },
      },
    })
    const registry = registryWith(profile, (context) => {
      context.emitResource({
        ref: context.ref,
        profile: { id: 'fake.item', version: 2 },
        payload: { text: 'hydrated' },
      })
    })
    const result = await exportSourceResource(
      exportInput(await freshDb(), registry, 'binary'),
    )
    expect(result).toEqual({
      bytes: Uint8Array.of(0, 255, 10),
      mediaType: 'application/octet-stream',
      format: 'binary',
      ref,
      warnings: [],
    })
    expect(calls).toEqual([[{ text: 'hydrated' }, undefined]])
  })

  test('built-in JSON takes precedence over a Profile declaration named json', async () => {
    let declaredCalls = 0
    const profile = defineProfile({
      id: 'fake.item',
      version: 1,
      schema: z.object({ text: z.string() }),
      exports: {
        json: {
          mediaType: 'text/plain',
          render() {
            declaredCalls += 1
            return 'override'
          },
        },
      },
    })
    const registry = registryWith(profile)
    const db = await freshDb()
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: profile.id, version: profile.version },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'payload' },
    })
    const result = await exportSourceResource(exportInput(db, registry, 'json'))
    expect(new TextDecoder().decode(result.bytes)).toBe('{"text":"payload"}')
    expect(result.mediaType).toBe('application/json')
    expect(declaredCalls).toBe(0)
  })

  test('reports sorted exact-version registry-derived formats', async () => {
    const profile = defineProfile({
      id: 'fake.item',
      version: 3,
      schema: z.object({ text: z.string() }),
      exports: {
        zed: { mediaType: 'text/z', render: () => 'z' },
        alpha: { mediaType: 'text/a', render: () => 'a' },
      },
    })
    const registry = registryWith(profile)
    const db = await freshDb()
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: profile.id, version: profile.version },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'payload' },
    })
    const error = await exportSourceResource(
      exportInput(db, registry, 'missing'),
    ).catch((caught) => caught)
    expect(error).toMatchObject({
      code: 'unsupported_export_format',
      validFormats: ['alpha', 'json', 'zed'],
      profile: { id: 'fake.item', version: 3 },
    })
    expect((error as Error).message).toContain('fake.item@3')
    expect((error as Error).message).toContain('alpha, json, zed')
  })

  test('rejects unavailable Profiles and null or schema-invalid payloads as data integrity failures', async () => {
    const db = await freshDb()
    const unknownRegistry = registryWith()
    new ResourceStore(db, unknownRegistry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: 'missing.item', version: 7 },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'opaque' },
    })
    await expect(
      exportSourceResource(exportInput(db, unknownRegistry, 'json')),
    ).rejects.toMatchObject({
      code: 'data_integrity',
      message: expect.stringContaining('missing.item@7'),
    })

    const profile = defineProfile({
      id: 'fake.item',
      version: 1,
      schema: z.object({ text: z.string() }),
    })
    const registry = registryWith(profile)
    const secondDb = await freshDb()
    new ResourceStore(secondDb, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: profile.id, version: profile.version },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'valid' },
    })
    secondDb
      .prepare('UPDATE resources SET payload_json = NULL WHERE ref = ?')
      .run(ref)
    await expect(
      exportSourceResource(exportInput(secondDb, registry, 'json')),
    ).rejects.toMatchObject({ code: 'data_integrity' })
    secondDb
      .prepare(
        'UPDATE resources SET payload_json = \'{"wrong":true}\' WHERE ref = ?',
      )
      .run(ref)
    await expect(
      exportSourceResource(exportInput(secondDb, registry, 'json')),
    ).rejects.toMatchObject({ code: 'data_integrity' })
  })

  test('rejects invalid external renderer output as a data integrity failure', async () => {
    const profile = defineProfile({
      id: 'fake.item',
      version: 1,
      schema: z.object({ text: z.string() }),
      exports: {
        bad: {
          mediaType: 'text/plain',
          render: (() => ({ bad: true })) as never,
        },
      },
    })
    const registry = registryWith(profile)
    const db = await freshDb()
    new ResourceStore(db, registry.profiles).upsert({
      ref,
      sourceId,
      profile: { id: profile.id, version: profile.version },
      origin: 'adhoc',
      completeness: 'complete',
      payload: { text: 'valid' },
    })
    await expect(
      exportSourceResource(exportInput(db, registry, 'bad')),
    ).rejects.toMatchObject({
      code: 'data_integrity',
      message: expect.stringContaining('returned invalid bytes'),
    })
  })
})
