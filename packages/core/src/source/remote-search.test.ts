import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { testOAuthProvider } from '../testing/oauth-provider'
import { searchSourceRemote } from './remote-search'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const profile = defineProfile({
  id: 'fake.remote',
  version: 1,
  schema: z.object({ text: z.string() }),
  search: {
    title: (payload) => payload.text,
    fields: { text: { type: 'string', extract: (payload) => payload.text } },
  },
})
const provider = testOAuthProvider({
  authorizationUrl: 'https://provider.test/auth',
  tokenUrl: 'https://provider.test/token',
})

const adapter = defineAdapter({
  id: 'fake.remote-adapter',
  configSchema: z.object({}).strict(),
  provider,
  access: { scopes: ['remote:read'] },
  providerApiHosts: ['provider.test'],
  profiles: [profile],
  routing: 'federated',
  capabilities: ['search-remote'],
  operations: {
    searchRemote: async ({ source, query, fetch }) => {
      await fetch('https://provider.test/search')
      return {
        resources: [
          {
            ref:
              query.text === 'invalid-ref'
                ? 'not-a-ref'
                : `ctx://${source.id}/item/provider-1`,
            profile: { id: 'fake.remote', version: 1 },
            title: 'provider title',
            occurredAt: 1234,
            ...(query.text === 'missing-payload'
              ? {}
              : { payload: { text: query.text } }),
          },
        ],
        warnings: [
          {
            code: 'provider_warning',
            message: 'provider result was partial',
          },
        ],
        continuation: 'adapter-next-page',
      }
    },
  },
  actions: {},
})
const registry = createExtensionRegistry([
  defineExtension({
    id: 'fake.remote-extension',
    adapters: [adapter],
  }),
])
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
}
const authService = {
  async resolveLinkedGrantAccessToken() {
    return 'linked-token'
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []
const tempDirs: string[] = []

async function freshDb(path = ':memory:'): Promise<Database> {
  const db = new Database(path, { create: true })
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm-1', 'work', 'Work', 1)",
  ).run()
  db.prepare(
    "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-1', 'test', 'account-1', 'subject-1', 1, 1)",
  ).run()
  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at)
     VALUES ('grant-1', 'account-1', 'test', '["remote:read"]', 'secret://test/app', 1, 1)`,
  ).run()
  db.prepare(
    `INSERT INTO sources
       (id, realm_id, adapter_id, label, config_json, grant_id, sync_enabled, created_at, updated_at)
     VALUES (?, 'realm-1', 'fake.remote-adapter', ?, '{}', 'grant-1', 1, 1, 1)`,
  ).run(sourceId, sourceId)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
  return Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('searchSourceRemote', () => {
  test('preserves cancellation before optional cache materialization', async () => {
    const db = await freshDb()
    const controller = new AbortController()
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(
      searchSourceRemote({
        db,
        sourceId,
        registry,
        authService,
        logger,
        query: { text: 'cancelled', limit: 5 },
        signal: controller.signal,
        fetch: async () => new Response(),
      }),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'cancelled' })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 0 },
    )
  })

  test('propagates non-contention storage failures', async () => {
    const db = await freshDb()

    await expect(
      searchSourceRemote({
        db,
        sourceId,
        registry,
        authService,
        logger,
        query: { text: 'invalid-ref', limit: 5 },
        signal: new AbortController().signal,
        fetch: async () => new Response(),
      }),
    ).rejects.toMatchObject({ code: 'invalid_ref' })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 0 },
    )
  })

  test('preserves provider results when optional cache materialization exhausts contention', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ctxindex-remote-busy-'))
    tempDirs.push(directory)
    const path = join(directory, 'ctxindex.sqlite')
    const db = await freshDb(path)
    db.exec('PRAGMA busy_timeout = 10')
    const holder = new Database(path)
    dbs.push(holder)
    applyPragmas(holder)
    holder.exec('BEGIN IMMEDIATE')

    let result: Awaited<ReturnType<typeof searchSourceRemote>>
    try {
      result = await searchSourceRemote({
        db,
        sourceId,
        registry,
        authService,
        logger,
        query: { text: 'contended', limit: 5 },
        signal: new AbortController().signal,
        fetch: async () => new Response(),
      })
    } finally {
      holder.exec('ROLLBACK')
    }

    expect(result.resources).toEqual([
      expect.objectContaining({
        ref: `ctx://${sourceId}/item/provider-1`,
        payload: { text: 'contended' },
      }),
    ])
    expect(result.warnings).toEqual([
      { code: 'provider_warning', message: 'provider result was partial' },
      {
        code: 'storage_busy',
        message: expect.stringContaining('try again'),
      },
    ])
    expect(result.warnings[1]?.message).not.toMatch(
      /SQLITE|database.*lock|busy/i,
    )
  })

  test('cancellation wins when scheduled during exhausted cache contention', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ctxindex-remote-abort-'))
    tempDirs.push(directory)
    const path = join(directory, 'ctxindex.sqlite')
    const db = await freshDb(path)
    db.exec('PRAGMA busy_timeout = 50')
    const holder = new Database(path)
    dbs.push(holder)
    applyPragmas(holder)
    holder.exec('BEGIN IMMEDIATE')
    const controller = new AbortController()
    const abortTimer = setTimeout(
      () => controller.abort(new DOMException('cancelled', 'AbortError')),
      10,
    )

    let caught: unknown
    try {
      await searchSourceRemote({
        db,
        sourceId,
        registry,
        authService,
        logger,
        query: { text: 'cancelled while busy', limit: 5 },
        signal: controller.signal,
        fetch: async () => new Response(),
      })
    } catch (error) {
      caught = error
    } finally {
      clearTimeout(abortTimer)
      holder.exec('ROLLBACK')
    }

    expect(caught).toMatchObject({ name: 'AbortError', message: 'cancelled' })
    expect(caught).not.toMatchObject({ code: 'storage_busy' })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      { count: 0 },
    )
  })

  test('cancellation wins when scheduled during a successful cache wait', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ctxindex-remote-wait-'))
    tempDirs.push(directory)
    const path = join(directory, 'ctxindex.sqlite')
    const readyPath = join(directory, 'ready')
    const db = await freshDb(path)
    const holder = Bun.spawn({
      cmd: [
        process.execPath,
        '-e',
        `import { Database } from 'bun:sqlite';
         import { writeFileSync } from 'node:fs';
         const db = new Database(process.argv[1]);
         db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
         writeFileSync(process.argv[2], 'ready');
         setTimeout(() => { db.exec('ROLLBACK'); db.close(); }, 300);`,
        path,
        readyPath,
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    })

    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (await Bun.file(readyPath).exists()) break
        await Bun.sleep(10)
      }
      expect(await Bun.file(readyPath).exists()).toBeTrue()
      const controller = new AbortController()
      const abortTimer = setTimeout(
        () => controller.abort(new DOMException('cancelled', 'AbortError')),
        10,
      )
      let caught: unknown
      try {
        await searchSourceRemote({
          db,
          sourceId,
          registry,
          authService,
          logger,
          query: { text: 'cancelled after wait', limit: 5 },
          signal: controller.signal,
          fetch: async () => new Response(),
        })
      } catch (error) {
        caught = error
      } finally {
        clearTimeout(abortTimer)
      }

      expect(caught).toMatchObject({
        name: 'AbortError',
        message: 'cancelled',
      })
      expect(caught).not.toMatchObject({ code: 'storage_busy' })
      expect(await holder.exited).toBe(0)
    } finally {
      holder.kill()
    }
  })

  test('materializes provider resources idempotently and preserves warnings', async () => {
    const db = await freshDb()
    const authorizations: string[] = []
    const input = {
      db,
      sourceId,
      registry,
      authService,
      logger,
      query: { text: 'hello', limit: 5 },
      signal: new AbortController().signal,
      fetch: async (_url: string, init?: RequestInit) => {
        authorizations.push(
          new Headers(init?.headers).get('authorization') ?? '',
        )
        return new Response()
      },
    }

    const first = await searchSourceRemote(input)
    const store = new ResourceStore(db, registry.profiles)
    const storedFirst = store.get(`ctx://${sourceId}/item/provider-1`)
    const second = await searchSourceRemote(input)
    const storedSecond = store.get(`ctx://${sourceId}/item/provider-1`)

    expect(first.warnings).toEqual([
      { code: 'provider_warning', message: 'provider result was partial' },
    ])
    expect(first.continuation).toBe('adapter-next-page')
    expect(second.warnings).toEqual(first.warnings)
    expect(second.continuation).toBe(first.continuation)
    expect(authorizations).toEqual([
      'Bearer linked-token',
      'Bearer linked-token',
    ])
    expect(storedFirst).toMatchObject({
      ref: `ctx://${sourceId}/item/provider-1`,
      sourceId,
      profile: { id: 'fake.remote', version: 1 },
      origin: 'adhoc',
      hydratedAt: null,
      payload: { text: 'hello' },
    })
    expect(storedSecond?.id).toBe(storedFirst?.id)
    expect(
      db.prepare('SELECT title, occurred_at FROM resources').get(),
    ).toEqual({ title: 'hello', occurred_at: 1234 })
    expect(db.prepare('SELECT count(*) AS count FROM resources').get()).toEqual(
      {
        count: 1,
      },
    )
  })
  test('post-filters typed fields and excludes unverifiable provider envelopes', async () => {
    const db = await freshDb()
    const base = {
      db,
      sourceId,
      registry,
      authService: authService as AuthService,
      logger,
      signal: new AbortController().signal,
      fetch: async () => new Response(),
    }

    const mismatch = await searchSourceRemote({
      ...base,
      query: {
        text: 'hello',
        limit: 5,
        fields: [{ name: 'text', type: 'string', value: 'other' }],
      },
    })
    expect(mismatch.resources).toEqual([])

    const unverifiable = await searchSourceRemote({
      ...base,
      query: {
        text: 'missing-payload',
        limit: 5,
        fields: [{ name: 'text', type: 'string', value: 'missing-payload' }],
      },
    })
    expect(unverifiable.resources).toEqual([])
    expect(unverifiable.warnings).toContainEqual(
      expect.objectContaining({ code: 'provider_filter_unverifiable' }),
    )
  })
})
