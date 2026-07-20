import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { Logger } from '../logger'
import { createRealmService } from '../realm'
import { createExtensionRegistry } from '../registry'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { createSourceService } from './service'

let db: Database

import { testOAuthProvider } from '../testing/oauth-provider'

const logger = { debug() {} } as unknown as Logger
const gmailScope = 'https://www.googleapis.com/auth/gmail.readonly'
const googleProvider = testOAuthProvider({
  id: 'google',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
})
const localProfile = defineProfile({
  id: 'test.local',
  version: 1,
  schema: z.object({ path: z.string() }),
})
const localConfigSchema = z.object({ root_path: z.string().min(1) }).strict()
const registry = createExtensionRegistry([
  defineExtension({
    id: 'test.sources',
    adapters: [
      defineAdapter({
        id: 'google.mailbox',
        configSchema: z.object({}).strict(),
        provider: googleProvider,
        access: { scopes: [gmailScope] },
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
        configSchema: localConfigSchema,
        profiles: [localProfile],
        routing: 'indexed',
        capabilities: ['sync'],
        operations: { sync() {} },
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

test('derives Source availability from the exact Adapter id', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({
    db,
    logger,
    realmService,
    registry,
  })
  const added = service.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    configJson: '{"root_path":"/tmp"}',
  })

  expect(service.listSources()[0]?.availability).toBe('available')
  expect(service.findSourceById(added.sourceId)?.availability).toBe('available')

  const missingAdapterService = createSourceService({
    db,
    logger,
    realmService,
    registry: createExtensionRegistry(),
  })
  expect(missingAdapterService.listSources()[0]?.availability).toBe(
    'extension_unavailable',
  )
  expect(
    missingAdapterService.findSourceById(added.sourceId)?.availability,
  ).toBe('extension_unavailable')
})

test('status includes never-synced Sources with pending sync status', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({ db, logger, realmService, registry })
  const added = service.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    configJson: '{"root_path":"/tmp"}',
  })

  expect(service.getStatus()).toEqual([
    {
      sourceId: added.sourceId,
      adapterId: 'local.directory',
      realmSlug: 'work',
      availability: 'available',
      lastStatus: 'pending',
      lastRunAt: null,
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 0,
      lastError: null,
      cursor: null,
    },
  ])
})

test('status and Source inventory project separate warning and error diagnostics', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({ db, logger, realmService, registry })
  const added = service.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    configJson: '{"root_path":"/tmp"}',
  })
  const warning = {
    code: 'degraded',
    message: 'partial provider response',
  }
  db.prepare(
    `INSERT INTO sync_runs (
       id, source_id, realm_id, mode, status, started_at, completed_at,
       warnings_count, last_warning_json, errors_count, error_summary
     ) VALUES ('run-1', ?, ?, 'sync', 'failed', 1, 2, 2, ?, 7, ?)`,
  ).run(
    added.sourceId,
    added.realmId,
    JSON.stringify(warning),
    'historical run error',
  )
  db.prepare(
    `INSERT INTO source_sync_state (
       source_id, last_status, last_run_id, warnings_count, last_warning_json,
       errors_count, last_error_json, updated_at
     ) VALUES (?, 'failed', 'run-1', 2, ?, 1, ?, 2)`,
  ).run(
    added.sourceId,
    JSON.stringify(warning),
    JSON.stringify('provider request failed'),
  )

  expect(service.getStatus()[0]).toMatchObject({
    warningsCount: 2,
    lastWarning: warning,
    errorsCount: 1,
    lastError: 'provider request failed',
  })
  expect(service.listSources()[0]).toMatchObject({
    warnings_count: 2,
    last_warning: warning,
    errors_count: 1,
    last_error: 'provider request failed',
  })
})

test('missing and restored Adapters preserve historical sync status', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const availableService = createSourceService({
    db,
    logger,
    realmService,
    registry,
  })
  const added = availableService.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    configJson: '{"root_path":"/tmp"}',
  })
  db.prepare(
    `INSERT INTO source_sync_state
       (source_id, last_status, cursor_json, updated_at)
     VALUES (?, 'failed', '{"page":3}', 42)`,
  ).run(added.sourceId)

  const missingService = createSourceService({
    db,
    logger,
    realmService,
    registry: createExtensionRegistry(),
  })
  expect(missingService.getStatus()[0]).toMatchObject({
    availability: 'extension_unavailable',
    lastStatus: 'failed',
    cursor: { page: 3 },
  })

  expect(availableService.getStatus()[0]).toMatchObject({
    availability: 'available',
    lastStatus: 'failed',
    cursor: { page: 3 },
  })
  expect(
    db
      .prepare('SELECT * FROM source_sync_state WHERE source_id = ?')
      .get(added.sourceId),
  ).toEqual({
    source_id: added.sourceId,
    last_status: 'failed',
    last_run_id: null,
    cursor_json: '{"page":3}',
    warnings_count: 0,
    last_warning_json: null,
    errors_count: 0,
    last_error_json: null,
    updated_at: 42,
  })
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
  test('persists the requested Source sync policy and defaults to enabled', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })

    const defaulted = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'defaulted',
      configJson: '{"root_path":"/tmp/defaulted"}',
    })
    const disabled = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'disabled',
      configJson: '{"root_path":"/tmp/disabled"}',
      syncEnabled: false,
    })
    const enabled = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'enabled',
      configJson: '{"root_path":"/tmp/enabled"}',
      syncEnabled: true,
    })

    expect(service.findSourceById(defaulted.sourceId)?.sync_enabled).toBe(true)
    expect(service.findSourceById(disabled.sourceId)?.sync_enabled).toBe(false)
    expect(service.findSourceById(enabled.sourceId)?.sync_enabled).toBe(true)
  })

  test('defaults Source labels verbatim and rejects global collisions', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })

    const local = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: '{"root_path":"/tmp"}',
    })
    expect(service.findSourceById(local.sourceId)?.label).toBe('directory')
    expect(() =>
      service.addSource({
        adapterId: 'local.directory',
        realmSlug: 'work',
        configJson: '{"root_path":"/other"}',
      }),
    ).toThrow(
      'Source label "directory" is already taken; choose another with --label',
    )

    db.prepare(
      "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-google', 'google', 'work@example.com', 'subject-google', 1, 1)",
    ).run()
    db.prepare(
      "INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at) VALUES (?, ?, ?, ?, 'secret://test/app', 1, 1)",
    ).run(
      'grant-google',
      'account-google',
      'google',
      JSON.stringify([gmailScope]),
    )
    const mailbox = service.addSource({
      adapterId: 'google.mailbox',
      realmSlug: 'work',
      grantId: 'grant-google',
    })
    expect(service.findSourceById(mailbox.sourceId)?.label).toBe(
      'work@example.com-mailbox',
    )
  })

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
      'INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)',
    )
    const insertGrant = db.prepare(
      "INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at) VALUES (?, ?, ?, ?, 'secret://test/app', 1, 1)",
    )
    insertAccount.run('account-google', 'google', 'google', 'subject-google')
    insertGrant.run('grant-google', 'account-google', 'google', '[]')
    expect(() =>
      service.addSource({
        adapterId: 'google.mailbox',
        realmSlug: 'work',
        grantId: 'grant-google',
      }),
    ).toThrow('not compatible')
  })

  test('binds an explicit compatible Grant to the selected Adapter id', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    db.prepare(
      "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-google', 'google', 'google', 'subject-google', 1, 1)",
    ).run()
    db.prepare(
      "INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at) VALUES (?, ?, ?, ?, 'secret://test/app', 1, 1)",
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
        .prepare('SELECT adapter_id, grant_id FROM sources WHERE id = ?')
        .get(added.sourceId),
    ).toEqual({
      adapter_id: 'google.mailbox',
      grant_id: 'grant-google',
    })
  })

  test('auto-binds only one compatible Grant and rejects ambiguity', () => {
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    db.prepare(
      "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-google', 'google', 'google', 'subject-google', 1, 1)",
    ).run()
    const insertGrant = db.prepare(
      "INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, created_at, updated_at) VALUES (?, ?, ?, ?, 'secret://test/app', 1, 1)",
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

    db.prepare(
      "INSERT INTO accounts (id, provider, label, external_user_id, created_at, updated_at) VALUES ('account-google-two', 'google', 'google-two', 'subject-google-two', 1, 1)",
    ).run()
    insertGrant.run(
      'grant-two',
      'account-google-two',
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

  test('providerless Adapter needs no Grant and rejects a supplied Grant', () => {
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

  test('removeSource cascades every generic Source-owned row and preserves another Source', () => {
    const realmService = createRealmService({ db, logger })
    const realm = realmService.createRealm({ slug: 'work' })
    const service = createSourceService({ db, logger, realmService, registry })
    const target = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'target',
      configJson: '{"root_path":"/tmp/target"}',
    })
    const survivor = service.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      label: 'survivor',
      configJson: '{"root_path":"/tmp/survivor"}',
    })

    function seedGraph(sourceId: string, suffix: 'target' | 'survivor') {
      const resourceId = `resource-${suffix}`
      const ref = `ctx://${sourceId}/file/${suffix}`
      const runId = `run-${suffix}`
      const ids = {
        resource: resourceId,
        field: `field-${suffix}`,
        chunk: `chunk-${suffix}`,
        relation: `relation-${suffix}`,
        artifact: `artifact-${suffix}`,
        run: runId,
        checkpoint: `checkpoint-${suffix}`,
        lock: `lock-${suffix}`,
      }
      db.prepare(
        `INSERT INTO resources
           (id, ref, source_id, realm_id, profile_id, profile_version, title,
            origin, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'file', 1, ?, 'synced', '{}', 1, 1)`,
      ).run(ids.resource, ref, sourceId, realm.realmId, `${suffix}needle`)
      db.prepare(
        `INSERT INTO field_index
           (id, resource_id, field, declared_type, ordinal, value_text)
         VALUES (?, ?, 'path', 'string', 0, ?)`,
      ).run(ids.field, ids.resource, suffix)
      db.prepare(
        `INSERT INTO chunks (id, resource_id, chunk_index, content, created_at)
         VALUES (?, ?, 0, ?, 1)`,
      ).run(ids.chunk, ids.resource, `${suffix}chunk`)
      db.prepare(
        `INSERT INTO relations
           (id, source_resource_id, relation, target_ref, created_at)
         VALUES (?, ?, 'related', ?, 1)`,
      ).run(ids.relation, ids.resource, ref)
      db.prepare(
        `INSERT INTO relation_resolutions
           (relation_id, target_resource_id, resolved_at)
         VALUES (?, ?, 1)`,
      ).run(ids.relation, ids.resource)
      db.prepare(
        `INSERT INTO artifacts
           (id, ref, resource_id, origin_ref, content_hash, media_type,
            byte_size, retention_class, local_path, created_at)
         VALUES (?, ?, ?, ?, ?, 'text/plain', 1, 'cached', ?, 1)`,
      ).run(
        ids.artifact,
        `${ref}/artifact/data`,
        ids.resource,
        ref,
        `sha256:${(suffix === 'target' ? 'a' : 'b').repeat(64)}`,
        `/tmp/${ids.artifact}`,
      )
      db.prepare(
        `INSERT INTO sync_runs
           (id, source_id, realm_id, mode, status, started_at)
         VALUES (?, ?, ?, 'sync', 'completed', 1)`,
      ).run(ids.run, sourceId, realm.realmId)
      db.prepare(
        `INSERT INTO source_sync_state
           (source_id, last_status, last_run_id, cursor_json, updated_at)
         VALUES (?, 'idle', ?, '{}', 1)`,
      ).run(sourceId, ids.run)
      db.prepare(
        `INSERT INTO sync_run_checkpoints
           (id, run_id, cursor_json, recorded_at)
         VALUES (?, ?, '{}', 1)`,
      ).run(ids.checkpoint, ids.run)
      db.prepare(
        `INSERT INTO sync_locks (scope, run_id, owner_pid, acquired_at)
         VALUES (?, ?, 1, 1)`,
      ).run(ids.lock, ids.run)
      return ids
    }

    const targetIds = seedGraph(target.sourceId, 'target')
    const survivorIds = seedGraph(survivor.sourceId, 'survivor')

    service.removeSource(target.sourceId)

    const rows = [
      ['sources', 'id', target.sourceId, survivor.sourceId],
      ['resources', 'id', targetIds.resource, survivorIds.resource],
      ['field_index', 'id', targetIds.field, survivorIds.field],
      ['chunks', 'id', targetIds.chunk, survivorIds.chunk],
      ['relations', 'id', targetIds.relation, survivorIds.relation],
      ['artifacts', 'id', targetIds.artifact, survivorIds.artifact],
      ['source_sync_state', 'source_id', target.sourceId, survivor.sourceId],
      ['sync_runs', 'id', targetIds.run, survivorIds.run],
      [
        'sync_run_checkpoints',
        'id',
        targetIds.checkpoint,
        survivorIds.checkpoint,
      ],
      ['sync_locks', 'scope', targetIds.lock, survivorIds.lock],
    ] as const
    for (const [table, column, removed, kept] of rows) {
      expect(
        db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(removed),
        `${table} target row`,
      ).toBeNull()
      expect(
        db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(kept),
        `${table} survivor row`,
      ).not.toBeNull()
    }
    expect(
      db
        .prepare('SELECT 1 FROM relation_resolutions WHERE relation_id = ?')
        .get(targetIds.relation),
    ).toBeNull()
    expect(
      db
        .prepare('SELECT 1 FROM relation_resolutions WHERE relation_id = ?')
        .get(survivorIds.relation),
    ).not.toBeNull()
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'targetneedle'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM resources_fts WHERE resources_fts MATCH 'survivorneedle'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'targetchunk'",
        )
        .get(),
    ).toEqual({ count: 0 })
    expect(
      db
        .prepare(
          "SELECT count(*) AS count FROM chunks_fts WHERE chunks_fts MATCH 'survivorchunk'",
        )
        .get(),
    ).toEqual({ count: 1 })
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('SELECT count(*) AS count FROM realms').get()).toEqual({
      count: 1,
    })
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

test('resolves Source labels before ids', () => {
  const realmService = createRealmService({ db, logger })
  realmService.createRealm({ slug: 'work' })
  const service = createSourceService({ db, logger, realmService, registry })
  const { sourceId } = service.addSource({
    adapterId: 'local.directory',
    realmSlug: 'work',
    label: 'notes',
    configJson: JSON.stringify({ root_path: '/tmp' }),
  })

  expect(service.resolveSourceId('notes')).toBe(sourceId)
  expect(service.resolveSourceId(sourceId)).toBe(sourceId)
  expect(() => service.resolveSourceId('missing')).toThrow('source not found')
})
