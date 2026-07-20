import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  defineAdapter,
  defineExtension,
  defineOAuthApp,
  docs,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { catalogSnapshotPath, type InstalledExtensionRecord } from '../catalog'
import { defaultConfig } from '../config'
import { runMigrations } from '../storage'
import { createSandbox } from '../testing'
import { testOAuthProvider } from '../testing/oauth-provider'
import { loadExtensions } from './loader'

const databases: Database[] = []

async function writeExtensionPackage(
  root: string,
  source: string,
): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@ctxindex/catalog-fixture',
      ctxindex: { extensions: ['./entry.ts'] },
    }),
  )
  await writeFile(join(root, 'entry.ts'), source)
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('loadExtensions', () => {
  test('imports a trusted external TypeScript Extension from a configured path', async () => {
    const config = {
      ...defaultConfig(),
      extensions: {
        paths: [resolve(import.meta.dir, 'fixtures/valid-package')],
      },
    }

    const result = await loadExtensions({ config, builtins: {} })

    expect(result.registry.list().map(({ id }) => id)).toEqual([
      'fixture.external',
    ])
    expect(
      result.registry.profiles.get({ id: 'fixture.note', version: 1 }),
    ).toBeDefined()
    expect(result.diagnostics).toEqual([])
    expect(
      result.completeRegistry.provenances.get('extension:fixture.external'),
    ).toEqual([
      {
        origin: 'explicit-path',
        packageName: '@ctxindex/fixture-valid',
        entry: resolve(import.meta.dir, 'fixtures/valid-package/entry.ts'),
        exportName: 'default',
      },
    ])
  })

  test('binds package-sidecar documentation before atomic activation', async () => {
    const extensionPath = await mkdtemp(
      join(import.meta.dir, '.documented-extension-'),
    )
    try {
      await writeExtensionPackage(
        extensionPath,
        `import { defineExtension, docs } from '@ctxindex/extension-sdk'
export default defineExtension({ id: 'fixture.documented', docs: docs('./docs') })
`,
      )
      await mkdir(join(extensionPath, 'docs'))
      await writeFile(join(extensionPath, 'docs/README.md'), '# Package docs')

      const result = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })

      expect(result.registry.list().map(({ id }) => id)).toEqual([
        'fixture.documented',
      ])
      expect(
        result.documentation.get('fixture.documented', 'README.md'),
      ).toMatchObject({ content: '# Package docs', origin: 'authored' })

      await writeFile(
        join(extensionPath, 'docs/README.md'),
        '[unsafe](file:///etc/passwd)',
      )
      const invalid = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })
      expect(invalid.registry.list()).toEqual([])
      expect(invalid.documentation.list()).toEqual([])
      expect(invalid.diagnostics).toEqual([
        {
          path: extensionPath,
          message: 'Invalid Extension documentation at README.md',
        },
      ])
    } finally {
      await rm(extensionPath, { recursive: true, force: true })
    }
  })

  test('keeps documentation projection non-throwing for unrepresentable schemas', async () => {
    const adapter = defineAdapter({
      id: 'fixture.transformed',
      configSchema: z.object({ value: z.string() }).transform(({ value }) => ({
        value: value.trim(),
      })),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const builtin = defineExtension({
      id: 'fixture.unrepresentable-schema',
      adapters: [adapter],
    })

    const result = await loadExtensions({
      config: defaultConfig(),
      builtins: { builtin },
    })

    expect(result.registry.adapters.get({ id: adapter.id })).toBe(adapter)
    expect(
      result.documentation.get(
        builtin.id,
        'generated/adapters/fixture.transformed.json',
      ),
    ).toBeDefined()
  })

  test.each([
    ['documentation-free', defineExtension({ id: 'fixture.shared-export' })],
    [
      'documented',
      defineExtension({
        id: 'fixture.shared-documented-export',
        docs: docs({
          index: 'README.md',
          files: [
            {
              path: 'README.md',
              kind: 'markdown',
              mediaType: 'text/markdown',
              content: '# Shared',
            },
          ],
        }),
      }),
    ],
  ] as const)('coalesces repeated %s Extension exports', async (_, shared) => {
    const result = await loadExtensions({
      config: defaultConfig(),
      builtins: { default: shared, shared },
    })

    expect(result.registry.list().map(({ id }) => id)).toEqual([shared.id])
    expect(result.diagnostics).toEqual([])
  })
  test('loads built-ins first and reports an external id conflict', async () => {
    const builtin = defineExtension({
      id: 'fixture.builtin',
      profiles: [],
      adapters: [],
    })
    const extensionPath = resolve(
      import.meta.dir,
      'fixtures/conflicting-package',
    )
    const config = {
      ...defaultConfig(),
      extensions: { paths: [extensionPath] },
    }

    const result = await loadExtensions({ config, builtins: { builtin } })

    expect(result.registry.list()).toEqual([builtin])
    expect(result.diagnostics).toEqual([
      {
        path: extensionPath,
        message: 'Conflicting Extension definition',
      },
    ])
  })

  test('reports invalid Extensions without activating any of their definitions', async () => {
    const extensionPath = resolve(import.meta.dir, 'fixtures/invalid-package')
    const config = {
      ...defaultConfig(),
      extensions: { paths: [extensionPath] },
    }

    const result = await loadExtensions({ config, builtins: {} })

    expect(result.registry.list()).toEqual([])
    expect(
      result.registry.profiles.get({ id: 'fixture.invalid-note', version: 1 }),
    ).toBeUndefined()
    expect(
      result.registry.adapters.get({
        id: 'fixture.invalid-adapter',
      }),
    ).toBeUndefined()
    expect(result.diagnostics).toEqual([
      {
        path: extensionPath,
        message: 'Capability retrieve requires operation retrieve',
      },
    ])
  })

  test('collapses arbitrary configured-package evaluation failures', async () => {
    const extensionPath = await mkdtemp(
      join(import.meta.dir, '.throwing-extension-'),
    )
    try {
      await writeExtensionPackage(
        extensionPath,
        `throw new Error('super-secret-value')\n`,
      )

      const result = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })

      expect(result.diagnostics).toEqual([
        {
          path: extensionPath,
          message: 'Extension entry could not be evaluated',
        },
      ])
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        'super-secret-value',
      )
    } finally {
      await rm(extensionPath, { recursive: true, force: true })
    }
  })

  test('collapses registry errors forged by exported getters', async () => {
    const extensionPath = await mkdtemp(
      join(import.meta.dir, '.throwing-getter-extension-'),
    )
    try {
      await writeExtensionPackage(
        extensionPath,
        `import { DefinitionRegistryError } from '@ctxindex/core/registry'
const extension = { kind: 'extension', id: 'fixture.throwing-getter', providers: [], oauthApps: [], profiles: [], adapters: [] }
export default new Proxy(extension, {
  ownKeys() {
    throw new DefinitionRegistryError('orchid-river-742', 'invalid_definition')
  },
})
`,
      )

      const result = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })

      expect(result.diagnostics).toEqual([
        {
          path: extensionPath,
          message: 'Extension exports could not be inspected',
        },
      ])
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        'orchid-river-742',
      )
    } finally {
      await rm(extensionPath, { recursive: true, force: true })
    }
  })

  test('ignores mutation of a public helper diagnostic rethrown by a getter', async () => {
    const extensionPath = await mkdtemp(
      join(import.meta.dir, '.mutated-diagnostic-extension-'),
    )
    try {
      await writeExtensionPackage(
        extensionPath,
        `import { selectExactExtension } from '@ctxindex/core/extension'
let diagnostic
try {
  selectExactExtension([], 'fixture.missing')
} catch (cause) {
  cause.message = 'orchid-river-742'
  diagnostic = cause
}
const extension = { kind: 'extension', id: 'fixture.mutated-diagnostic', providers: [], oauthApps: [], profiles: [], adapters: [] }
export default new Proxy(extension, {
  ownKeys() {
    throw diagnostic
  },
})
`,
      )

      const result = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })

      expect(result.diagnostics).toEqual([
        {
          path: extensionPath,
          message: 'Requested Extension was not exported',
        },
      ])
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        'orchid-river-742',
      )
    } finally {
      await rm(extensionPath, { recursive: true, force: true })
    }
  })

  test('redacts invalid OAuth App config details from path diagnostics', async () => {
    const extensionPath = await mkdtemp(
      join(import.meta.dir, '.redaction-extension-'),
    )
    try {
      await writeExtensionPackage(
        extensionPath,
        `import { auth, defineExtension, defineOAuthApp, defineProvider, z } from '@ctxindex/extension-sdk'
const provider = defineProvider({
  id: 'fixture.redaction-oauth',
  auth: auth.oauth2({
    authorizationUrl: 'https://auth.example.com/authorize',
    tokenUrl: 'https://auth.example.com/token',
    identity: { url: 'https://api.example.com/me', subjectPath: ['id'], labelPaths: [['email']], identities: [{ kind: 'email', path: ['email'] }] },
    pkce: { method: 'S256', required: true },
    registration: {
      type: 'public',
      configSchema: z.object({ clientId: z.string(), desktopSecret: z.string() }).transform(() => {
        throw new Error('client-id-canary keychain:ctxindex/app/client-id clientId desktop-secret-canary')
      }),
      environment: { clientId: 'GOOGLE_CLIENT_ID', desktopSecret: 'GOOGLE_DESKTOP_SECRET' },
    },
    baseScopes: ['openid'],
    allowedHosts: ['api.example.com', 'auth.example.com'],
  }),
})
const app = defineOAuthApp(provider, { label: 'desktop', config: { clientId: 'client-id-canary', desktopSecret: 'desktop-secret-canary' } })
export default defineExtension({ id: 'fixture.redaction', oauthApps: [app] })
`,
      )

      const result = await loadExtensions({
        config: {
          ...defaultConfig(),
          extensions: { paths: [extensionPath] },
        },
        builtins: {},
      })

      expect(result.diagnostics).toEqual([
        {
          path: extensionPath,
          message: 'Invalid OAuth App config',
        },
      ])
      expect(JSON.stringify(result.diagnostics)).not.toMatch(
        /client-id-canary|keychain:|clientId|desktop-secret-canary/,
      )
    } finally {
      await rm(extensionPath, { recursive: true, force: true })
    }
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
         id, realm_id, adapter_id, label, config_json,
         sync_enabled, created_at, updated_at
       ) VALUES ('source-1', 'realm-1', 'fixture.returned', 'Fixture', '{}', 1, 1, 1)`,
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
      builtins: {},
    })

    expect(missing.diagnostics).toHaveLength(1)
    expect(
      missing.registry.adapters.get({ id: 'fixture.returned' }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(before)

    const adapter = defineAdapter({
      id: 'fixture.returned',
      configSchema: z.object({}),
      profiles: [],
      routing: 'indexed',
      capabilities: [],
      operations: {},
      actions: {},
    })
    const restored = await loadExtensions({
      config: defaultConfig(),
      builtins: {
        restored: defineExtension({
          id: 'fixture.returned-extension',
          profiles: [],
          adapters: [adapter],
        }),
      },
    })

    expect(
      restored.registry.adapters.get({ id: 'fixture.returned' }),
    ).toBeDefined()
    expect(snapshot()).toEqual(before)
  })
  test('requires callers to provide an explicit built-in module namespace', async () => {
    await expect(
      loadExtensions({ config: defaultConfig() } as never),
    ).rejects.toThrow(
      'loadExtensions requires an explicit built-in module namespace',
    )
  })

  test('rejects an Extension OAuth App that collides with a local BYOA identity', async () => {
    const provider = testOAuthProvider({
      id: 'fixture.oauth',
      authorizationUrl: 'https://auth.example.com/authorize',
      tokenUrl: 'https://auth.example.com/token',
    })
    const app = defineOAuthApp(provider, {
      label: 'desktop',
      config: { clientId: 'public-client' },
    })

    await expect(
      loadExtensions({
        config: defaultConfig(),
        builtins: {
          oauth: defineExtension({
            id: 'fixture.oauth-extension',
            oauthApps: [app],
          }),
        },
        localOAuthAppIdentities: [
          { providerId: provider.id, label: app.label },
        ],
      }),
    ).rejects.toThrow('Duplicate OAuth App')
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
      await writeExtensionPackage(
        join(snapshot, 'extension-package'),
        `export default { kind: 'extension', id: 'fixture.installed', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`,
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
              source: { kind: 'inline', path: 'extension-package' },
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
        source_path: 'extension-package',
      }

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: {},
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
          kind: 'catalog',
          catalog: 'fixture',
          catalogId: 'fixture.catalog',
          repository: '/local/catalog.git',
          commit,
          snapshotAcquiredAt: 1,
          sourcePath: 'extension-package',
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
      await writeExtensionPackage(
        join(snapshot, 'extension-package'),
        `export default { kind: 'extension', id: 'fixture.builtin', providers: [{ kind: 'provider', id: 'fixture.catalog-provider', auth: { kind: 'none' } }], oauthApps: [], profiles: [], adapters: [] }\n`,
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
              source: { kind: 'inline', path: 'extension-package' },
            },
          ],
        }),
      )
      const builtin = defineExtension({
        id: 'fixture.builtin',
        profiles: [],
        adapters: [],
      })

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: { builtin },
        installed: [
          {
            id: 'fixture.builtin',
            version: 1,
            catalog_name: 'fixture',
            catalog_id: 'fixture.catalog',
            repository: '/local/catalog.git',
            commit,
            snapshot_acquired_at: 1,
            source_path: 'extension-package',
          },
        ],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list()).toEqual([builtin])
      expect(result.provenance).toEqual([
        { id: 'fixture.builtin', kind: 'builtin' },
      ])
      expect(result.diagnostics).toEqual([
        {
          path: join(snapshot, 'extension-package'),
          message: 'Conflicting Extension definition',
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
        builtins: {},
        installed: [
          {
            id: 'fixture.missing',
            version: 1,
            catalog_name: 'missing',
            catalog_id: 'missing.catalog',
            repository: 'https://example.invalid/catalog.git',
            commit,
            snapshot_acquired_at: 1,
            source_path: 'extension-package',
          },
        ],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list()).toEqual([])
      expect(result.provenance).toEqual([])
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]?.message).toContain(
        'Catalog Extension package could not be loaded',
      )
    } finally {
      await sandbox.cleanup()
    }
  })
})
