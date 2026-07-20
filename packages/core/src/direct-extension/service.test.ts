import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineAdapter, defineExtension, z } from '@ctxindex/extension-sdk'
import { createExtensionRegistry } from '../registry'
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
    await writeFile(
      join(stagingRoot, 'package', 'entry.ts'),
      `export default { kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`,
    )
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

test('install selects one exact root, publishes, and rejects a repeated direct id before acquisition', async () => {
  const { materializer, service } = await fixtureService()
  const installed = await service.install({
    target: {
      kind: 'local',
      requestedTarget: '/fixture',
      originPath: '/fixture',
    },
    extensionId: 'example.direct',
    registry: createExtensionRegistry([]),
    localOAuthAppIdentities: [],
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
      registry: createExtensionRegistry([]),
      localOAuthAppIdentities: [],
    }),
  ).rejects.toMatchObject({ code: 'extension_target_invalid' })
  expect(materializer.calls).toBe(1)
})

test('failed update preserves the prior exact record', async () => {
  const { materializer, service, store } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@^1' },
    extensionId: 'example.direct',
    registry: createExtensionRegistry([]),
    localOAuthAppIdentities: [],
  })
  materializer.fail = true
  await expect(
    service.update({
      extensionId: 'example.direct',
      registry: createExtensionRegistry([
        {
          kind: 'extension',
          id: 'example.direct',
          providers: [],
          oauthApps: [],
          profiles: [],
          adapters: [],
        },
      ]),
      localOAuthAppIdentities: [],
      alternateOriginAvailable: false,
    }),
  ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
  expect(await store.readRecords()).toEqual([installed])
})

test('same-content update is an idempotent no-op', async () => {
  const { service } = await fixtureService()
  const installed = await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@^1' },
    extensionId: 'example.direct',
    registry: createExtensionRegistry([]),
    localOAuthAppIdentities: [],
  })
  const updated = await service.update({
    extensionId: 'example.direct',
    registry: createExtensionRegistry([
      {
        kind: 'extension',
        id: 'example.direct',
        providers: [],
        oauthApps: [],
        profiles: [],
        adapters: [],
      },
    ]),
    localOAuthAppIdentities: [],
    alternateOriginAvailable: false,
  })
  expect(updated).toEqual(installed)
})

test('uninstall blocks dependent Sources and force removes only activation state', async () => {
  const { service, store } = await fixtureService()
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    registry: createExtensionRegistry([]),
    localOAuthAppIdentities: [],
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
  await expect(
    service.uninstall({
      extensionId: 'example.direct',
      registry,
      sources: [source],
      alternateOriginAvailable: false,
      force: false,
    }),
  ).rejects.toMatchObject({
    code: 'extension_removal_blocked',
    blockingSources: [source],
  })
  expect(await store.readRecords()).toHaveLength(1)
  const result = await service.uninstall({
    extensionId: 'example.direct',
    registry,
    sources: [source],
    alternateOriginAvailable: false,
    force: true,
  })
  expect(result.blockingSources).toEqual([source])
  expect(await store.readRecords()).toEqual([])
})

test('alternate origin keeps Adapter availability during uninstall', async () => {
  const { service } = await fixtureService()
  await service.install({
    target: { kind: 'npm', requestedTarget: 'example-package@1' },
    extensionId: 'example.direct',
    registry: createExtensionRegistry([]),
    localOAuthAppIdentities: [],
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
    registry: createExtensionRegistry([shared]),
    sources: [{ id: 'source-1', label: 'mail', adapterId: 'shared.adapter' }],
    alternateOriginAvailable: true,
    force: false,
  })
  expect(result.blockingSources).toEqual([])
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
      registry: createExtensionRegistry([]),
      localOAuthAppIdentities: [],
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
      registry: createExtensionRegistry([]),
      localOAuthAppIdentities: [],
    }),
  ).resolves.toMatchObject({ id: 'example.direct' })
  await expect(
    service.uninstall({
      extensionId: 'example.direct',
      registry: createExtensionRegistry([
        defineExtension({ id: 'example.direct' }),
      ]),
      sources: [],
      alternateOriginAvailable: false,
      force: false,
    }),
  ).resolves.toMatchObject({ blockingSources: [] })
})
