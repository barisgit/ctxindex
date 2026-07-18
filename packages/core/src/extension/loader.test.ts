import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { defineAdapter, defineExtension } from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { catalogSnapshotPath, type InstalledExtensionRecord } from '../catalog'
import { defaultConfig } from '../config'
import { runMigrations } from '../storage'
import { createSandbox } from '../testing'
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

  test('Extension disappearance and reload leave stored sync and materialized rows byte-for-byte untouched', async () => {
    const db = new Database(':memory:', { create: true })
    databases.push(db)
    await runMigrations(db)
    db.prepare(
      "INSERT INTO realms (id, slug, created_at) VALUES ('realm-1', 'work', 1)",
    ).run()
    db.prepare(
      `INSERT INTO sources (
         id, realm_id, adapter_id, adapter_version, label, config_json,
         sync_enabled, created_at, updated_at
       ) VALUES ('source-1', 'realm-1', 'fixture.returned', 1, 'Fixture', '{}', 1, 1, 1)`,
    ).run()
    db.prepare(
      `INSERT INTO source_sync_state (
         source_id, last_status, cursor_json, updated_at
       ) VALUES ('source-1', 'failed', '{"page":3}', 42)`,
    ).run()
    db.prepare(
      `INSERT INTO resources (
         id, ref, source_id, realm_id, profile_id, profile_version, title,
         payload_json, origin, created_at, updated_at
       ) VALUES (
         'resource-1', 'ctx://source-1/item/1', 'source-1', 'realm-1',
         'fixture.note', 1, 'Preserved note', '{"body":"unchanged"}',
         'synced', 1, 1
       )`,
    ).run()
    const snapshot = () => ({
      sources: db.prepare('SELECT * FROM sources ORDER BY id').all(),
      syncState: db
        .prepare('SELECT * FROM source_sync_state ORDER BY source_id')
        .all(),
      resources: db.prepare('SELECT * FROM resources ORDER BY id').all(),
    })
    const before = snapshot()
    const missingPath = resolve(import.meta.dir, 'fixtures/disappeared.ts')

    const missing = await loadExtensions({
      config: {
        ...defaultConfig(),
        extensions: { paths: [missingPath] },
      },
      builtins: [],
    })

    expect(missing.diagnostics).toHaveLength(1)
    expect(
      missing.registry.adapters.get({ id: 'fixture.returned', version: 1 }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(before)

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
    const restored = await loadExtensions({
      config: defaultConfig(),
      builtins: [
        defineExtension({
          id: 'fixture.returned-extension',
          version: 1,
          profiles: [],
          adapters: [adapter],
        }),
      ],
    })

    expect(
      restored.registry.adapters.get({ id: 'fixture.returned', version: 1 }),
    ).toBeDefined()
    expect(snapshot()).toEqual(before)
  })
  test('requires callers to provide an explicit complete built-ins list', async () => {
    await expect(
      loadExtensions({ config: defaultConfig() } as never),
    ).rejects.toThrow(
      'loadExtensions requires an explicit complete builtins list',
    )
  })

  test('loads exact installed Catalog provenance offline', async () => {
    const sandbox = await createSandbox()
    try {
      const commit = 'a'.repeat(40)
      const snapshot = catalogSnapshotPath(
        sandbox.env.CTXINDEX_DATA_HOME,
        'fixture',
        commit,
      )
      await mkdir(snapshot, { recursive: true })
      await writeFile(
        join(snapshot, 'extension.ts'),
        `export default ({ defineExtension }) => defineExtension({ id: 'fixture.installed', version: 1, profiles: [], adapters: [] })\n`,
      )
      await writeFile(
        join(snapshot, 'ctxindex-catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          catalog: { id: 'fixture.catalog', name: 'Fixture' },
          extensions: [
            {
              id: 'fixture.installed',
              version: 1,
              source: { kind: 'inline', path: 'extension.ts' },
            },
          ],
        }),
      )
      const installed: InstalledExtensionRecord = {
        id: 'fixture.installed',
        version: 1,
        catalog_name: 'fixture',
        catalog_id: 'fixture.catalog',
        repository: '/local/catalog.git',
        commit,
        snapshot_acquired_at: 1,
        source_path: 'extension.ts',
      }

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: [],
        installed: [installed],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list().map(({ id }) => id)).toEqual([
        'fixture.installed',
      ])
      expect(result.diagnostics).toEqual([])
      expect(result.provenance).toEqual([
        {
          id: 'fixture.installed',
          version: 1,
          kind: 'catalog',
          catalog: 'fixture',
          catalogId: 'fixture.catalog',
          repository: '/local/catalog.git',
          commit,
          snapshotAcquiredAt: 1,
          sourcePath: 'extension.ts',
        },
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('keeps built-ins active when an installed Catalog identity conflicts', async () => {
    const sandbox = await createSandbox()
    try {
      const commit = 'c'.repeat(40)
      const snapshot = catalogSnapshotPath(
        sandbox.env.CTXINDEX_DATA_HOME,
        'fixture',
        commit,
      )
      await mkdir(snapshot, { recursive: true })
      await writeFile(
        join(snapshot, 'extension.ts'),
        `export default ({ defineExtension }) => defineExtension({ id: 'fixture.builtin', version: 1, profiles: [], adapters: [] })\n`,
      )
      await writeFile(
        join(snapshot, 'ctxindex-catalog.json'),
        JSON.stringify({
          schemaVersion: 1,
          catalog: { id: 'fixture.catalog', name: 'Fixture' },
          extensions: [
            {
              id: 'fixture.builtin',
              version: 1,
              source: { kind: 'inline', path: 'extension.ts' },
            },
          ],
        }),
      )
      const builtin = defineExtension({
        id: 'fixture.builtin',
        version: 1,
        profiles: [],
        adapters: [],
      })

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: [builtin],
        installed: [
          {
            id: 'fixture.builtin',
            version: 1,
            catalog_name: 'fixture',
            catalog_id: 'fixture.catalog',
            repository: '/local/catalog.git',
            commit,
            snapshot_acquired_at: 1,
            source_path: 'extension.ts',
          },
        ],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list()).toEqual([builtin])
      expect(result.provenance).toEqual([
        { id: 'fixture.builtin', version: 1, kind: 'builtin' },
      ])
      expect(result.diagnostics).toEqual([
        {
          path: join(snapshot, 'extension.ts'),
          message: 'Duplicate Extension fixture.builtin@1',
        },
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('reports missing installed snapshots without fetching or activating', async () => {
    const sandbox = await createSandbox()
    try {
      const commit = 'b'.repeat(40)
      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: [],
        installed: [
          {
            id: 'fixture.missing',
            version: 1,
            catalog_name: 'missing',
            catalog_id: 'missing.catalog',
            repository: 'https://example.invalid/catalog.git',
            commit,
            snapshot_acquired_at: 1,
            source_path: 'extension.ts',
          },
        ],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list()).toEqual([])
      expect(result.provenance).toEqual([])
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]?.message).toContain(
        'missing ctxindex-catalog.json',
      )
    } finally {
      await sandbox.cleanup()
    }
  })
})
