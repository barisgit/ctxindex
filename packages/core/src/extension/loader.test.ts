import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  defineAdapter,
  defineExtension,
  defineOAuthApp,
  docs,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import { defaultConfig } from '../config'
import {
  DirectExtensionStore,
  type GenericExtensionInstallationRecord,
  hashDirectory,
} from '../direct-extension'
import { runMigrations } from '../storage'
import { createSandbox } from '../testing'
import { testOAuthProvider } from '../testing/oauth-provider'
import { loadExtensions } from './loader'

const databases: Database[] = []

async function writeExtensionPackage(
  root: string,
  source: string,
  entry = 'entry.ts',
): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@ctxindex/catalog-fixture',
      ctxindex: { extensions: [`./${entry}`] },
    }),
  )
  await writeFile(join(root, entry), source)
}

async function publishInstalledExtension(input: {
  readonly root: string
  readonly dataRoot: string
  readonly id: string
  readonly source?: string
  readonly entry?: string
}): Promise<GenericExtensionInstallationRecord> {
  const staging = join(input.root, `staging-${input.id}`)
  await writeExtensionPackage(
    join(staging, 'package'),
    input.source ??
      `export default { kind: 'extension', id: '${input.id}', providers: [{ kind: 'provider', id: '${input.id}.provider', auth: { kind: 'none' } }], oauthApps: [], profiles: [], adapters: [] }\n`,
    input.entry,
  )
  const materializationDigest = await hashDirectory(staging)
  await new DirectExtensionStore({
    configRoot: join(input.root, 'config'),
    dataRoot: input.dataRoot,
  }).publishMaterialization(staging, materializationDigest)
  return {
    id: input.id,
    source: {
      kind: 'local',
      requested_target: `/unavailable/${input.id}`,
      content_digest: 'd'.repeat(64),
    },
    dependency_resolution: {
      format: 'bun.lock@1.3.14',
      digest: 'e'.repeat(64),
    },
    materialization_digest: materializationDigest,
    package_root: 'package',
    installed_at: 10,
    updated_at: 20,
  }
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

  test('loads curated generic records offline after the data root is relocated', async () => {
    const sandbox = await createSandbox()
    try {
      const originalDataRoot = join(sandbox.dir, 'original-data')
      const relocatedDataRoot = join(sandbox.dir, 'relocated-data')
      const commit = 'a'.repeat(40)
      const generic = await publishInstalledExtension({
        root: sandbox.dir,
        dataRoot: originalDataRoot,
        id: 'fixture.installed',
        entry: 'catalog.ts',
        source: `const extension = (id) => ({ kind: 'extension', id, providers: [], oauthApps: [], profiles: [], adapters: [] })
export default {
  kind: 'catalog',
  id: 'fixture.catalog',
  label: 'Fixture Catalog',
  extensions: [extension('fixture.first'), extension('fixture.second'), extension('fixture.installed')],
}
`,
      })
      const sourceLocator = {
        kind: 'literal' as const,
        module: './catalog.ts',
        catalogId: 'fixture.catalog',
        entryIndex: 2,
        extensionId: generic.id,
      }
      const installed: GenericExtensionInstallationRecord = {
        ...generic,
        curation: {
          extension_id: generic.id,
          catalog_name: 'fixture',
          catalog_id: 'fixture.catalog',
          repository: 'https://example.invalid/catalog.git',
          commit,
          snapshot_acquired_at: 1,
          source_locator: sourceLocator,
          execution_materialization_digest: generic.materialization_digest,
        },
      }
      await rename(originalDataRoot, relocatedDataRoot)

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: {},
        installed: [installed],
        dataRoot: relocatedDataRoot,
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
          repository: 'https://example.invalid/catalog.git',
          commit,
          snapshotAcquiredAt: 1,
          sourceLocator,
          sourceKind: 'local',
          requestedTarget: '/unavailable/fixture.installed',
          resolvedIdentity: 'd'.repeat(64),
          materializationDigest: generic.materialization_digest,
          installedAt: 10,
          updatedAt: 20,
        },
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('loads a curated package record through exact Extension selection', async () => {
    const sandbox = await createSandbox()
    try {
      const generic = await publishInstalledExtension({
        root: sandbox.dir,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        id: 'fixture.curated-package',
        source: `export const sibling = { kind: 'extension', id: 'fixture.unselected', providers: [], oauthApps: [], profiles: [], adapters: [] }
export default { kind: 'extension', id: 'fixture.curated-package', providers: [], oauthApps: [], profiles: [], adapters: [] }
`,
      })
      const commit = 'c'.repeat(40)
      const installed: GenericExtensionInstallationRecord = {
        ...generic,
        curation: {
          extension_id: generic.id,
          catalog_name: 'community',
          catalog_id: 'community.catalog',
          repository: 'https://example.invalid/community.git',
          commit,
          snapshot_acquired_at: 30,
          source_locator: { kind: 'package', entryIndex: 4 },
          execution_materialization_digest: generic.materialization_digest,
        },
      }

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: {},
        installed: [installed],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list().map(({ id }) => id)).toEqual([
        'fixture.curated-package',
      ])
      expect(result.diagnostics).toEqual([])
      expect(result.provenance).toEqual([
        expect.objectContaining({
          id: 'fixture.curated-package',
          kind: 'catalog',
          catalog: 'community',
          catalogId: 'community.catalog',
          sourceLocator: { kind: 'package', entryIndex: 4 },
        }),
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('degrades only a colliding generic installed record', async () => {
    const sandbox = await createSandbox()
    try {
      const installed = await publishInstalledExtension({
        root: sandbox.dir,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        id: 'fixture.builtin',
      })
      const builtin = defineExtension({
        id: 'fixture.builtin',
        profiles: [],
        adapters: [],
      })

      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: { builtin },
        installed: [installed],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list()).toEqual([builtin])
      expect(result.provenance).toEqual([
        { id: 'fixture.builtin', kind: 'builtin' },
      ])
      expect(result.diagnostics).toEqual([
        {
          path: 'installed:fixture.builtin',
          message: 'Conflicting Extension definition',
        },
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('degrades a missing generic materialization without affecting siblings', async () => {
    const sandbox = await createSandbox()
    try {
      const valid = await publishInstalledExtension({
        root: sandbox.dir,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        id: 'fixture.available',
      })
      const result = await loadExtensions({
        config: defaultConfig(),
        builtins: {},
        installed: [
          {
            ...valid,
            id: 'fixture.missing',
            materialization_digest: 'f'.repeat(64),
          },
          valid,
        ],
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })

      expect(result.registry.list().map(({ id }) => id)).toEqual([
        'fixture.available',
      ])
      expect(result.provenance).toEqual([
        expect.objectContaining({ id: 'fixture.available', kind: 'direct' }),
      ])
      expect(result.diagnostics).toHaveLength(1)
      expect(result.diagnostics[0]).toEqual(
        expect.objectContaining({ path: 'installed:fixture.missing' }),
      )
    } finally {
      await sandbox.cleanup()
    }
  })
})
