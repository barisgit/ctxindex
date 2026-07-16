import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { Logger } from '../logger'
import { createRealmService } from '../realm'
import { createExtensionRegistry } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSourceService } from './service'

let db: Database
const logger = { debug() {} } as unknown as Logger
const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly'
const registry = createExtensionRegistry([
  defineExtension({
    id: 'test.sources',
    version: 1,
    profiles: [],
    adapters: [
      defineAdapter({
        id: 'google.mailbox',
        version: 2,
        configSchema: z.object({}).strict(),
        auth: {
          kind: 'oauth2',
          provider: {
            authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
          },
          scopes: [gmailScope],
        },
        profiles: [],
        routing: 'federated',
        capabilities: ['search-remote'],
        operations: {
          searchRemote: async () => ({ resources: [], warnings: [] }),
        },
        actions: {},
      }),
      defineAdapter({
        id: 'local.directory',
        version: 1,
        configSchema: z.object({ root_path: z.string().min(1) }).strict(),
        auth: { kind: 'none' },
        profiles: [],
        routing: 'indexed',
        capabilities: [],
        operations: {},
        actions: {},
      }),
    ],
  }),
])

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

test('addSource validates config against the selected Adapter', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({ db, logger, realmService, registry })

  expect(() =>
    service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
    }),
  ).toThrow(expect.objectContaining({ code: 'invalid_source_config' }))
  expect(() =>
    service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: 'not-json',
    }),
  ).toThrow(expect.objectContaining({ code: 'invalid_source_config' }))
})

test('stores only routing overrides compatible with Adapter capabilities', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({ db, logger, realmService, registry })

  expect(() =>
    service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      searchRouting: 'federated',
      configJson: '{"root_path":"/tmp"}',
    }),
  ).toThrow('federated search routing requires search-remote')
  expect(() =>
    service.addSource({
      adapterId: 'google.mailbox',
      realmSlug: 'work',
      searchRouting: 'hybrid',
    }),
  ).toThrow('hybrid search routing requires sync and search-remote')

  const added = service.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    searchRouting: 'indexed',
    configJson: '{"root_path":"/tmp"}',
  })
  expect(service.findSourceById(added.sourceId)?.search_routing).toBe('indexed')
  expect(service.listSources()[0]?.search_routing).toBe('indexed')
  expect(() =>
    db
      .prepare('UPDATE sources SET search_routing = ? WHERE id = ?')
      .run('invalid', added.sourceId),
  ).toThrow()
})

afterEach(() => {
  db.close()
})

describe('source service', () => {
  test('addSource resolves a provided realm slug', () => {
    const realmService = createRealmService({ db, logger })
    const realm = realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    const added = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: '{"root_path":"/tmp"}',
    })

    expect(added.realmId).toBe(realm.realmId)
    expect(service.listSources({ realmSlug: 'work' })).toMatchObject([
      {
        id: added.sourceId,
        realm_id: realm.realmId,
        adapter_id: 'local.directory',
        config_json: '{"root_path":"/tmp"}',
      },
    ])
  })

  test('addSource requires an explicit Realm', () => {
    const service = createSourceService({ db, logger, registry })

    expect(() => service.addSource({ adapterId: 'local.directory' })).toThrow(
      'explicit Realm',
    )
  })

  test('unknown realm slug throws unknown realm validation error', () => {
    const service = createSourceService({ db, logger, registry })

    expect(() =>
      service.addSource({ adapterId: 'local.directory', realmSlug: 'missing' }),
    ).toThrow(expect.objectContaining({ code: 'unknown_realm' }))
  })

  test('authenticated Adapter cannot be created without a compatible Grant', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    expect(() =>
      service.addSource({
        adapterId: 'google.mailbox',
        realmSlug: 'work',
      }),
    ).toThrow('No compatible Grants')
  })

  test('rejects a scope-incompatible explicit Grant', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    const insertAccount = db.prepare(
      'INSERT INTO accounts (id, provider, created_at, updated_at) VALUES (?, ?, 1, 1)',
    )
    const insertGrant = db.prepare(
      'INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)',
    )
    insertAccount.run('account-google', 'google')
    insertGrant.run('grant-google', 'account-google', 'google', '[]')
    expect(() =>
      service.addSource({
        adapterId: 'google.mailbox',
        realmSlug: 'work',
        grantId: 'grant-google',
      }),
    ).toThrow('not compatible')
  })

  test('binds an explicit compatible Grant and persists the selected Adapter version', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    db.prepare(
      "INSERT INTO accounts (id, provider, created_at, updated_at) VALUES ('account-google', 'google', 1, 1)",
    ).run()
    db.prepare(
      'INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)',
    ).run(
      'grant-google',
      'account-google',
      'google',
      JSON.stringify([gmailScope]),
    )
    const added = service.addSource({
      adapterId: 'google.mailbox',
      realmSlug: 'work',
      grantId: 'grant-google',
    })
    expect(
      db
        .prepare('SELECT adapter_version, grant_id FROM sources WHERE id = ?')
        .get(added.sourceId),
    ).toEqual({
      adapter_version: 2,
      grant_id: 'grant-google',
    })
  })

  test('auto-binds only one compatible Grant and rejects ambiguity', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    db.prepare(
      "INSERT INTO accounts (id, provider, created_at, updated_at) VALUES ('account-google', 'google', 1, 1)",
    ).run()
    const insertGrant = db.prepare(
      'INSERT INTO grants (id, account_id, provider, scopes_json, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)',
    )
    insertGrant.run(
      'grant-one',
      'account-google',
      'google',
      JSON.stringify([gmailScope]),
    )
    const added = service.addSource({
      adapterId: 'google.mailbox',
      realmSlug: 'work',
    })
    expect(service.findSourceById(added.sourceId)).toMatchObject({
      grant_id: 'grant-one',
    })

    insertGrant.run(
      'grant-two',
      'account-google',
      'google',
      JSON.stringify([gmailScope]),
    )
    expect(() =>
      service.addSource({
        adapterId: 'google.mailbox',
        realmSlug: 'work',
      }),
    ).toThrow('multiple compatible Grants')
  })

  test('auth:none Adapter needs no Grant and rejects a supplied Grant', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    expect(() =>
      service.addSource({
        adapterId: 'local.directory',
        realmSlug: 'work',
        configJson: '{"root_path":"/tmp"}',
      }),
    ).not.toThrow()
    expect(() =>
      service.addSource({
        adapterId: 'local.directory',
        realmSlug: 'work',
        grantId: 'grant-any',
        configJson: '{"root_path":"/tmp"}',
      }),
    ).toThrow('does not accept a Grant')
  })

  test('rejects an unknown Adapter', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    expect(() =>
      service.addSource({ adapterId: 'missing.adapter', realmSlug: 'work' }),
    ).toThrow('Unknown Adapter')
  })
})
