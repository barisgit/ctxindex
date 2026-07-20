import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  auth,
  defineAdapter,
  defineExtension,
  defineProvider,
  z,
} from '@ctxindex/extension-sdk'
import { type CollectedExtension, createExtensionRegistry } from '../registry'
import type {
  MaterializedDirectExtension,
  PackageMaterializer,
} from './materializer'
import { DirectExtensionService } from './service'
import { DirectExtensionStore, hashDirectory } from './store'
import type { DirectExtensionTarget } from './target'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

class FixtureMaterializer implements PackageMaterializer {
  calls = 0
  fail = false
  cleanupFails = false
  entry = `export default { kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`

  async materialize(
    target: DirectExtensionTarget,
  ): Promise<MaterializedDirectExtension> {
    this.calls += 1
    if (this.fail)
      throw Object.assign(new Error('failed'), {
        code: 'extension_acquisition_failed',
        exitCode: 30,
      })
    const stagingRoot = await mkdtemp(
      join(tmpdir(), 'ctxindex-direct-service-'),
    )
    roots.push(stagingRoot)
    await mkdir(join(stagingRoot, 'package'))
    await writeFile(
      join(stagingRoot, 'package', 'package.json'),
      JSON.stringify({ ctxindex: { extensions: ['./entry.ts'] } }),
    )
    await writeFile(join(stagingRoot, 'package', 'entry.ts'), this.entry)
    const materializationDigest = await hashDirectory(stagingRoot)
    return {
      stagingRoot,
      packageRoot: 'package',
      source:
        target.kind === 'local'
          ? {
              kind: 'local',
              requested_target: target.requestedTarget,
              origin_path: target.originPath,
              content_digest: materializationDigest,
            }
          : target.kind === 'npm'
            ? {
                kind: 'npm',
                requested_target: target.requestedTarget,
                exact_version: '1.0.0',
              }
            : {
                kind: 'git',
                requested_target: target.requestedTarget,
                commit: 'a'.repeat(40),
              },
      materializationDigest,
      cleanup: () =>
        this.cleanupFails
          ? Promise.reject(new Error('staging cleanup failed'))
          : Promise.resolve(),
    }
  }
}

async function fixtureService() {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-lifecycle-'))
  roots.push(root)
  const store = new DirectExtensionStore({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
  })
  const materializer = new FixtureMaterializer()
  const service = new DirectExtensionService({
    store,
    materializer,
    now: () => 100,
  })
  return { store, materializer, service }
}

function loadValidationContext(
  registry = createExtensionRegistry([]),
  options: {
    readonly roots?: readonly CollectedExtension[]
    readonly alternateOriginAvailable?: boolean
  } = {},
) {
  return async () => ({
    registry,
    ...(options.roots === undefined ? {} : { roots: options.roots }),
    localOAuthAppIdentities: [],
    ...(options.alternateOriginAvailable === undefined
      ? {}
      : { alternateOriginAvailable: options.alternateOriginAvailable }),
  })
}

function loadUninstallContext(
  registry: ReturnType<typeof createExtensionRegistry>,
  sources: readonly {
    readonly id: string
    readonly label: string
    readonly adapterId: string
  }[],
  options: {
    readonly roots?: readonly CollectedExtension[]
    readonly alternateOriginAvailable?: boolean
  } = {},
) {
  return async () => ({
    ...(await loadValidationContext(registry, options)()),
    sources,
  })
}

test('install selects one exact root, publishes, and rejects a repeated direct id before acquisition', async () => {
  const { materializer, service } = await fixtureService()
  const installed = await service.install({
    target: {
      kind: 'local',
      requestedTarget: '/fixture',
      originPath: '/fixture',
    },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  expect(installed.id).toBe('example.direct')
  expect(materializer.calls).toBe(1)
  await expect(
    service.install({
      target: {
        kind: 'local',
        requestedTarget: '/fixture',
        originPath: '/fixture',
      },
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(),
    }),
  ).rejects.toMatchObject({ code: 'extension_target_invalid' })
  expect(materializer.calls).toBe(1)
})

test('install requires the exact exported root and validates the complete registry before publication', async () => {
  const { materializer, service, store } = await fixtureService()
  await expect(
    service.install({
      target: { kind: 'npm', requestedTarget: 'example-package@1' },
      extensionId: 'example.missing',
      loadValidationContext: loadValidationContext(),
    }),
  ).rejects.toMatchObject({ code: 'extension_validation_failed' })
  expect(await store.readRecords()).toEqual([])

  await expect(
    service.install({
      target: { kind: 'npm', requestedTarget: 'example-package@1' },
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(
        createExtensionRegistry([
          defineExtension({
            id: 'example.direct',
            providers: [
              defineProvider({ id: 'example.provider', auth: auth.none() }),
            ],
          }),
        ]),
      ),
    }),
  ).rejects.toMatchObject({ code: 'extension_conflict' })
  expect(materializer.calls).toBe(2)
  expect(await store.readRecords()).toEqual([])
})

test('install validates documentation compatibility before publication', async () => {
  const { service, store } = await fixtureService()
  const definition = defineExtension({ id: 'example.direct' })
  const activeRoot: CollectedExtension = {
    definition,
    provenance: {
      origin: 'explicit-path',
      entry: '/fixture/entry.ts',
      exportName: 'default',
    },
    documentation: {
      index: 'README.md',
      files: [
        {
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Existing documentation',
        },
      ],
    },
  }

  await expect(
    service.install({
      target: { kind: 'npm', requestedTarget: 'example-package@1' },
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(
        createExtensionRegistry([definition]),
        { roots: [activeRoot] },
      ),
    }),
  ).rejects.toMatchObject({ code: 'extension_conflict' })
  expect(await store.readRecords()).toEqual([])
})

test('update validates documentation compatibility before replacing the prior pin', async () => {
  const { materializer, service, store } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  materializer.entry = `
    export default {
      kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [],
      docs: { kind: 'virtual', index: 'README.md', files: [{ path: 'README.md', kind: 'markdown', mediaType: 'text/markdown', content: '# Updated' }] }
    }
  `
  const alternate = defineExtension({ id: 'example.direct' })
  const alternateRoot: CollectedExtension = {
    definition: alternate,
    provenance: {
      origin: 'explicit-path',
      entry: '/fixture/entry.ts',
      exportName: 'default',
    },
    documentation: {
      index: 'README.md',
      files: [
        {
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: '# Existing',
        },
      ],
    },
  }

  await expect(
    service.update({
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(
        createExtensionRegistry([alternate]),
        { roots: [alternateRoot], alternateOriginAvailable: true },
      ),
    }),
  ).rejects.toMatchObject({ code: 'extension_conflict' })
  expect(await store.readRecords()).toEqual([installed])
})

test('list tolerates invalid records and returns unrelated valid inventory', async () => {
  const { service, store } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  await writeFile(
    store.recordsPath,
    JSON.stringify({
      schema_version: 1,
      extensions: [installed, { id: 'invalid' }],
    }),
  )

  expect(await service.list()).toEqual([
    expect.objectContaining({ id: 'example.direct' }),
  ])
})

test('concurrent mutations refresh complete validation inside the lifecycle lock', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-concurrent-'))
  roots.push(root)
  const options = {
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
  }
  const firstMaterializer = new FixtureMaterializer()
  firstMaterializer.entry = `
    export default { kind: 'extension', id: 'example.first', providers: [], oauthApps: [], profiles: [], adapters: [] }
  `
  const secondMaterializer = new FixtureMaterializer()
  secondMaterializer.entry = `
    export default { kind: 'extension', id: 'example.second', providers: [], oauthApps: [], profiles: [], adapters: [] }
  `
  const first = new DirectExtensionService({
    store: new DirectExtensionStore(options),
    materializer: firstMaterializer,
  })
  const secondStore = new DirectExtensionStore(options)
  const second = new DirectExtensionService({
    store: secondStore,
    materializer: secondMaterializer,
  })
  const refreshValidationContext = (extensionId: string) => async () => {
    const records = await secondStore.readRecords()
    return {
      registry: createExtensionRegistry(
        records.length === 0
          ? []
          : [
              defineExtension({
                id: extensionId,
                providers: [
                  defineProvider({
                    id: `${extensionId}.conflict`,
                    auth: auth.none(),
                  }),
                ],
              }),
            ],
      ),
      localOAuthAppIdentities: [],
    }
  }

  const results = await Promise.allSettled([
    first.install({
      target: { kind: 'npm', requestedTarget: 'first@1' },
      extensionId: 'example.first',
      loadValidationContext: refreshValidationContext('example.first'),
    }),
    second.install({
      target: { kind: 'npm', requestedTarget: 'second@1' },
      extensionId: 'example.second',
      loadValidationContext: refreshValidationContext('example.second'),
    }),
  ])

  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
  expect(await secondStore.readRecords()).toHaveLength(1)
})

test('sibling roots from one package remain independent direct records', async () => {
  const { materializer, service, store } = await fixtureService()
  materializer.entry = `
    export const sibling = { kind: 'extension', id: 'example.sibling', providers: [], oauthApps: [], profiles: [], adapters: [] }
    export default { kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }
  `
  const registry = createExtensionRegistry([])
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(registry),
  })
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.sibling',
    loadValidationContext: loadValidationContext(
      createExtensionRegistry([defineExtension({ id: 'example.direct' })]),
    ),
  })
  expect((await store.readRecords()).map(({ id }) => id)).toEqual([
    'example.direct',
    'example.sibling',
  ])
})

test('failed update preserves the prior exact record', async () => {
  const { materializer, service, store } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@^1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  materializer.fail = true
  await expect(
    service.update({
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(
        createExtensionRegistry([
          {
            kind: 'extension',
            id: 'example.direct',
            providers: [],
            oauthApps: [],
            profiles: [],
            adapters: [],
          },
        ]),
      ),
    }),
  ).rejects.toMatchObject({
    code: 'extension_acquisition_failed',
    message: expect.stringContaining(
      'Direct Extension example.direct from npm example-package@^1',
    ),
  })
  expect(await store.readRecords()).toEqual([installed])
})

test('same-content update is an idempotent no-op', async () => {
  const { service } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@^1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  const updated = await service.update({
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(
      createExtensionRegistry([
        {
          kind: 'extension',
          id: 'example.direct',
          providers: [],
          oauthApps: [],
          profiles: [],
          adapters: [],
        },
      ]),
    ),
  })
  expect(updated).toEqual(installed)
})

test('uninstall blocks dependent Sources and force removes only activation state', async () => {
  const { service, store } = await fixtureService()
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  const adapter = defineAdapter({
    id: 'missing.adapter',
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  const loadedDirect = defineExtension({
    id: 'example.direct',
    adapters: [adapter],
  })
  const registry = createExtensionRegistry([loadedDirect])
  const source = { id: 'source-1', label: 'mail', adapterId: 'missing.adapter' }
  const earlierSource = {
    id: 'source-2',
    label: 'alpha',
    adapterId: 'missing.adapter',
  }
  await expect(
    service.uninstall({
      extensionId: 'example.direct',
      loadValidationContext: loadUninstallContext(registry, [
        source,
        earlierSource,
      ]),
      force: false,
    }),
  ).rejects.toMatchObject({
    code: 'extension_removal_blocked',
    blockingSources: [earlierSource, source],
  })
  expect(await store.readRecords()).toHaveLength(1)
  const result = await service.uninstall({
    extensionId: 'example.direct',
    loadValidationContext: loadUninstallContext(registry, [
      source,
      earlierSource,
    ]),
    force: true,
  })
  expect(result.blockingSources).toEqual([earlierSource, source])
  expect(await store.readRecords()).toEqual([])
})

test('alternate origin keeps Adapter availability during uninstall', async () => {
  const { service } = await fixtureService()
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    loadValidationContext: loadValidationContext(),
  })
  const adapter = defineAdapter({
    id: 'shared.adapter',
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  const shared = defineExtension({ id: 'example.direct', adapters: [adapter] })
  const result = await service.uninstall({
    extensionId: 'example.direct',
    loadValidationContext: loadUninstallContext(
      createExtensionRegistry([shared]),
      [{ id: 'source-1', label: 'mail', adapterId: 'shared.adapter' }],
      { alternateOriginAvailable: true },
    ),
    force: false,
  })
  expect(result.blockingSources).toEqual([])
})

test('concurrent guarded uninstalls refresh the post-removal candidate inside the lifecycle lock', async () => {
  const { materializer, service, store } = await fixtureService()
  materializer.entry = `
    export const second = { kind: 'extension', id: 'example.second', providers: [], oauthApps: [], profiles: [], adapters: [] }
    export default { kind: 'extension', id: 'example.first', providers: [], oauthApps: [], profiles: [], adapters: [] }
  `
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.first',
    loadValidationContext: loadValidationContext(),
  })
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.second',
    loadValidationContext: loadValidationContext(),
  })
  const sharedAdapter = defineAdapter({
    id: 'shared.adapter',
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  const loadCurrent = async () => {
    const records = await store.readRecords()
    const currentRoots: CollectedExtension[] = records.map((record) => ({
      definition: defineExtension({
        id: record.id,
        adapters: [sharedAdapter],
      }),
      provenance: {
        origin: 'direct',
        entry: `${record.id}.ts`,
        exportName: 'default',
      },
    }))
    return {
      registry: createExtensionRegistry(
        currentRoots.map(({ definition }) => definition),
      ),
      roots: currentRoots,
      localOAuthAppIdentities: [],
      sources: [{ id: 'source-1', label: 'mail', adapterId: 'shared.adapter' }],
    }
  }

  const results = await Promise.allSettled([
    service.uninstall({
      extensionId: 'example.first',
      loadValidationContext: loadCurrent,
      force: false,
    }),
    service.uninstall({
      extensionId: 'example.second',
      loadValidationContext: loadCurrent,
      force: false,
    }),
  ])

  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1)
  expect(await store.readRecords()).toHaveLength(1)
})

test('record failure rolls back a new pin and cleanup failure does not reverse a commit', async () => {
  const { materializer, service, store } = await fixtureService()
  const writeRecords = store.writeRecords.bind(store)
  store.writeRecords = async () => {
    throw new Error('record write failed')
  }
  await expect(
    service.install({
      target: { kind: 'npm', requestedTarget: 'example-package@1' },
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(),
    }),
  ).rejects.toThrow('record write failed')
  expect(await readdir(store.materializationsRoot)).toEqual([])

  store.writeRecords = writeRecords
  store.collectUnreferencedMaterializations = async () => {
    throw new Error('cleanup failed')
  }
  materializer.cleanupFails = true
  await expect(
    service.install({
      target: { kind: 'npm', requestedTarget: 'example-package@1' },
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(),
    }),
  ).resolves.toMatchObject({ id: 'example.direct' })
  await expect(
    service.uninstall({
      extensionId: 'example.direct',
      loadValidationContext: loadUninstallContext(
        createExtensionRegistry([defineExtension({ id: 'example.direct' })]),
        [],
      ),
      force: false,
    }),
  ).resolves.toMatchObject({ blockingSources: [] })
})
