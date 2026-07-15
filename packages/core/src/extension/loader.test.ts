import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { defaultConfig } from '../config'
import { runMigrations } from '../storage'
import { loadExtensions } from './loader'

const databases: Database[] = []

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('loadExtensions', () => {
  test('imports a trusted external TypeScript Extension from a configured path', async () => {
    const config = {
      ...defaultConfig(),
      extensions: {
        paths: [resolve(import.meta.dir, 'fixtures/valid-extension.ts')],
      },
    }

    const result = await loadExtensions({ config, builtins: [] })

    expect(result.registry.list().map(({ id }) => id)).toEqual([
      'fixture.external',
    ])
    expect(
      result.registry.profiles.get({ id: 'fixture.note', version: 1 }),
    ).toBeDefined()
    expect(result.diagnostics).toEqual([])
  })
  test('loads built-ins first and reports an external id conflict', async () => {
    const builtin = defineExtension({
      id: 'fixture.builtin',
      version: 1,
      profiles: [],
      adapters: [],
    })
    const extensionPath = resolve(
      import.meta.dir,
      'fixtures/conflicting-extension.ts',
    )
    const config = {
      ...defaultConfig(),
      extensions: { paths: [extensionPath] },
    }

    const result = await loadExtensions({ config, builtins: [builtin] })

    expect(result.registry.list()).toEqual([builtin])
    expect(result.diagnostics).toEqual([
      {
        path: extensionPath,
        message: 'Duplicate Extension fixture.builtin@1',
      },
    ])
  })

  test('reports invalid Extensions without activating any of their definitions', async () => {
    const extensionPath = resolve(
      import.meta.dir,
      'fixtures/invalid-extension.ts',
    )
    const config = {
      ...defaultConfig(),
      extensions: { paths: [extensionPath] },
    }

    const result = await loadExtensions({ config, builtins: [] })

    expect(result.registry.list()).toEqual([])
    expect(
      result.registry.profiles.get({ id: 'fixture.invalid-note', version: 1 }),
    ).toBeUndefined()
    expect(
      result.registry.adapters.get({
        id: 'fixture.invalid-adapter',
        version: 1,
      }),
    ).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        path: extensionPath,
        message: 'Capability retrieve requires operation retrieve',
      },
    ])
  })

  test('marks Sources unavailable without deleting materialized Resources when an Extension disappears', async () => {
    const db = new Database(':memory:', { create: true })
    databases.push(db)
    await runMigrations(db)
    db.prepare(
      `INSERT INTO sources (
         id, realm_id, adapter_id, adapter_version, display_name, config_json,
         sync_enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'source-1',
      'global',
      'fixture.missing',
      1,
      'Missing fixture',
      '{}',
      1,
      1,
      1,
    )
    db.prepare(
      `INSERT INTO resources (
         id, ref, source_id, realm_id, profile_id, profile_version, title,
         origin, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'resource-1',
      'fixture:item-1',
      'source-1',
      'global',
      'fixture.note',
      1,
      'Preserved note',
      'synced',
      1,
      1,
    )
    const missingPath = resolve(import.meta.dir, 'fixtures/disappeared.ts')
    const config = {
      ...defaultConfig(),
      extensions: { paths: [missingPath] },
    }

    const result = await loadExtensions({ config, builtins: [], db })

    expect(
      result.registry.adapters.get({ id: 'fixture.missing', version: 1 }),
    ).toBeUndefined()
    expect(
      db
        .prepare(
          'SELECT last_status FROM source_sync_state WHERE source_id = ?',
        )
        .get('source-1'),
    ).toEqual({ last_status: 'extension_unavailable' })
    expect(
      db.prepare('SELECT title FROM resources WHERE id = ?').get('resource-1'),
    ).toEqual({
      title: 'Preserved note',
    })
    expect(
      db.prepare('SELECT id FROM sources WHERE id = ?').get('source-1'),
    ).toEqual({
      id: 'source-1',
    })
  })
  test('recovers an unavailable Source to idle when its Adapter is loaded again', async () => {
    const db = new Database(':memory:', { create: true })
    databases.push(db)
    await runMigrations(db)
    db.prepare(
      `INSERT INTO sources (
         id, realm_id, adapter_id, adapter_version, display_name, config_json,
         sync_enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'source-returned',
      'global',
      'fixture.returned',
      1,
      'Returned fixture',
      '{}',
      1,
      1,
      1,
    )
    db.prepare(
      `INSERT INTO source_sync_state (
         source_id, last_status, last_run_id, cursor_json, updated_at
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run('source-returned', 'extension_unavailable', null, null, 1)
    db.prepare(
      `INSERT INTO resources (
         id, ref, source_id, realm_id, profile_id, profile_version, title,
         origin, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'resource-returned',
      'fixture:item-returned',
      'source-returned',
      'global',
      'fixture.note',
      1,
      'Still present',
      'synced',
      1,
      1,
    )
    const adapter = defineAdapter({
      id: 'fixture.returned',
      version: 1,
      configSchema: z.object({}),
      auth: { kind: 'none' },
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const builtin = defineExtension({
      id: 'fixture.returned-extension',
      version: 1,
      profiles: [],
      adapters: [adapter],
    })

    await loadExtensions({
      config: defaultConfig(),
      builtins: [builtin],
      db,
    })

    expect(
      db
        .prepare(
          'SELECT last_status FROM source_sync_state WHERE source_id = ?',
        )
        .get('source-returned'),
    ).toEqual({ last_status: 'idle' })
    expect(
      db
        .prepare('SELECT title FROM resources WHERE id = ?')
        .get('resource-returned'),
    ).toEqual({ title: 'Still present' })
    expect(
      db.prepare('SELECT id FROM sources WHERE id = ?').get('source-returned'),
    ).toEqual({ id: 'source-returned' })
  })
  test('requires callers to provide an explicit complete built-ins list', async () => {
    await expect(
      loadExtensions({ config: defaultConfig() } as never),
    ).rejects.toThrow(
      'loadExtensions requires an explicit complete builtins list',
    )
  })

  test("does not mark a loaded built-in Adapter's Source unavailable when an external path disappears", async () => {
    const db = new Database(':memory:', { create: true })
    databases.push(db)
    await runMigrations(db)
    db.prepare(
      `INSERT INTO sources (
         id, realm_id, adapter_id, adapter_version, display_name, config_json,
         sync_enabled, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'source-builtin',
      'global',
      'fixture.builtin-adapter',
      1,
      'Built-in fixture',
      '{}',
      1,
      1,
      1,
    )
    db.prepare(
      `INSERT INTO source_sync_state (
         source_id, last_status, last_run_id, cursor_json, updated_at
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run('source-builtin', 'idle', null, null, 1)
    const adapter = defineAdapter({
      id: 'fixture.builtin-adapter',
      version: 1,
      configSchema: z.object({}),
      auth: { kind: 'none' },
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const builtin = defineExtension({
      id: 'fixture.builtin-adapter-extension',
      version: 1,
      profiles: [],
      adapters: [adapter],
    })
    const missingPath = resolve(import.meta.dir, 'fixtures/disappeared.ts')
    const config = {
      ...defaultConfig(),
      extensions: { paths: [missingPath] },
    }

    const result = await loadExtensions({ config, builtins: [builtin], db })

    expect(result.diagnostics).toHaveLength(1)
    expect(
      db
        .prepare(
          'SELECT last_status FROM source_sync_state WHERE source_id = ?',
        )
        .get('source-builtin'),
    ).toEqual({ last_status: 'idle' })
  })
})
