import { afterEach, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
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
  ExactDependencyResolutionArtifact,
  MaterializedDirectExtension,
  PackageMaterializer,
} from './materializer'
import {
  DirectExtensionService,
  GenericExtensionPackageInstaller,
  type ResolvedExtensionCandidate,
} from './service'
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
  exactCalls = 0
  cleanupCalls = 0
  exactLocalPackageRoot: string | undefined
  pauseExactReturn?: () => Promise<void>
  pauseMaterializeReturn?: () => Promise<void>
  lastCatalogMetadataExclusion = false
  lastExactCatalogMetadataExclusion = false
  fail = false
  cleanupFails = false
  entry = `export default { kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`

  async materialize(
    target: DirectExtensionTarget,
    options: {
      readonly signal?: AbortSignal
      readonly excludeCatalogSnapshotMetadata?: boolean
    } = {},
  ): Promise<MaterializedDirectExtension> {
    this.calls += 1
    this.lastCatalogMetadataExclusion =
      options.excludeCatalogSnapshotMetadata === true
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
    const result: MaterializedDirectExtension = {
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
                package: 'fixture-package',
                exact_version: '1.0.0',
                integrity: 'sha512-fixture',
              }
            : {
                kind: 'git',
                requested_target: target.requestedTarget,
                repository: target.requestedTarget.replace(/#.*$/, ''),
                commit: 'a'.repeat(40),
              },
      materializationDigest,
      dependencyResolutionArtifact: {
        format: 'bun.lock@1.3.14',
        digest: 'b'.repeat(64),
        bytes: new TextEncoder().encode('{"fixture":true}\n'),
      },
      cleanup: () => {
        this.cleanupCalls += 1
        return this.cleanupFails
          ? Promise.reject(new Error('staging cleanup failed'))
          : Promise.resolve()
      },
    }
    await this.pauseMaterializeReturn?.()
    return result
  }

  async materializeExact(input: {
    readonly source: MaterializedDirectExtension['source']
    readonly packageRoot: string
    readonly materializationDigest: string
    readonly dependencyResolutionArtifact: ExactDependencyResolutionArtifact
    readonly localPackageRoot?: string
    readonly excludeCatalogSnapshotMetadata?: boolean
  }): Promise<MaterializedDirectExtension> {
    this.exactCalls += 1
    this.lastExactCatalogMetadataExclusion =
      input.excludeCatalogSnapshotMetadata === true
    this.exactLocalPackageRoot = input.localPackageRoot
    const target: DirectExtensionTarget =
      input.source.kind === 'local'
        ? {
            kind: 'local',
            requestedTarget: input.source.requested_target,
            originPath:
              input.localPackageRoot ?? (input.source.origin_path as string),
          }
        : {
            kind: input.source.kind,
            requestedTarget: input.source.requested_target,
          }
    const materialized = await this.materialize(target)
    await this.pauseExactReturn?.()
    return {
      ...materialized,
      source: input.source,
      packageRoot: input.packageRoot,
      materializationDigest: input.materializationDigest,
      dependencyResolutionArtifact: input.dependencyResolutionArtifact,
    }
  }
}

function exactInstallInput(resolved: ResolvedExtensionCandidate) {
  const artifact = resolved.dependencyResolutionArtifact
  return {
    replay: {
      ...resolved.replay,
      lock: {
        format: artifact.format,
        path: `ctxindex-resolutions/${artifact.digest}.json`,
        digest: artifact.digest,
        byteLength: artifact.bytes.byteLength,
      },
    },
    lockBytes: artifact.bytes,
    immutableSnapshotRoot: process.cwd(),
    selection: resolved.selection,
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

test('generic authoring resolution emits exact replay input without publishing installation state', async () => {
  const { materializer, store } = await fixtureService()
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
    now: () => 100,
  })

  const resolved = await installer.resolveForAuthoring({
    target: { kind: 'npm', target: 'example-package@^1' },
    selection: { kind: 'extension', extensionId: 'example.direct' },
    immutableBaseRoot: process.cwd(),
  })
  if (resolved.kind !== 'extension') throw new TypeError('Expected Extension')

  expect(resolved).toMatchObject({
    extensionId: 'example.direct',
    replay: {
      source: {
        kind: 'npm',
        requestedTarget: 'example-package@^1',
        package: 'fixture-package',
        version: '1.0.0',
      },
      packageRoot: 'package',
    },
    dependencyResolutionArtifact: {
      format: 'bun.lock@1.3.14',
    },
  })
  expect(await store.readRecords()).toEqual([])
  expect(materializer.cleanupCalls).toBe(0)
  await resolved.dispose()
  await resolved.dispose()
  expect(materializer.cleanupCalls).toBe(1)
})

test('generic authoring stores contained local provenance without an author path', async () => {
  const { materializer, store } = await fixtureService()
  const baseRoot = await mkdtemp(join(tmpdir(), 'ctxindex-authoring-root-'))
  roots.push(baseRoot)
  await mkdir(join(baseRoot, 'package'))
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
  })

  const resolved = await installer.resolveForAuthoring({
    target: { kind: 'local', target: './package' },
    selection: { kind: 'extension', extensionId: 'example.direct' },
    immutableBaseRoot: baseRoot,
  })
  if (resolved.kind !== 'extension') throw new TypeError('Expected Extension')

  expect(resolved.replay.source).toEqual({
    kind: 'local',
    requestedTarget: 'package',
    path: 'package',
    contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
  })
  const exact = exactInstallInput(resolved)
  await resolved.dispose()
  if (exact.replay.source.kind !== 'local')
    throw new TypeError('Expected local replay')
  await expect(
    installer.installExact({
      ...exact,
      replay: {
        ...exact.replay,
        source: { ...exact.replay.source, path: '..' },
      },
      immutableSnapshotRoot: baseRoot,
    }),
  ).rejects.toMatchObject({ code: 'extension_validation_failed' })
  await installer.installExact({ ...exact, immutableSnapshotRoot: baseRoot })
  expect(materializer.exactLocalPackageRoot).toBe(
    await realpath(join(baseRoot, 'package')),
  )
})

test('generic exact install selects a Catalog literal locator from replayed package bytes', async () => {
  const { materializer, store } = await fixtureService()
  materializer.entry = `
    export default {
      kind: 'catalog', id: 'example.catalog', label: 'Example',
      extensions: [{ kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }]
    }
  `
  const acquired = await materializer.materialize({
    kind: 'npm',
    requestedTarget: 'literal-package@1',
  })
  const candidate = {
    selection: {
      kind: 'catalog-entry' as const,
      module: 'entry.ts',
      catalogId: 'example.catalog',
      entryIndex: 0,
      extensionId: 'example.direct',
    },
    replay: {
      source: {
        kind: 'npm' as const,
        requestedTarget: acquired.source.requested_target,
        package:
          acquired.source.kind === 'npm'
            ? acquired.source.package
            : 'literal-package',
        version: '1.0.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: acquired.packageRoot,
      materializationDigest: acquired.materializationDigest,
      lock: {
        format: acquired.dependencyResolutionArtifact.format,
        path: 'ctxindex-resolutions/fixture.json',
        digest: acquired.dependencyResolutionArtifact.digest,
        byteLength: acquired.dependencyResolutionArtifact.bytes.byteLength,
      },
    },
    lockBytes: acquired.dependencyResolutionArtifact.bytes,
    immutableSnapshotRoot: process.cwd(),
  }
  await acquired.cleanup()
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
  })

  const installed = await installer.installExact(candidate)
  expect(installed).toMatchObject({ id: 'example.direct' })
})

test('generic authoring exact-selects a Catalog from a package with no top-level Extension', async () => {
  const { materializer, store } = await fixtureService()
  materializer.entry = `
    export default {
      kind: 'catalog', id: 'example.catalog', label: 'Example',
      extensions: [{ kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }]
    }
  `
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
  })

  const resolved = await installer.resolveForAuthoring({
    target: { kind: 'npm', target: 'author-package@1' },
    selection: {
      kind: 'catalog',
      module: './entry.ts',
    },
    immutableBaseRoot: process.cwd(),
  })

  expect(resolved).toMatchObject({
    kind: 'catalog',
    selection: {
      module: './entry.ts',
      catalogId: 'example.catalog',
    },
    selectedRoot: { kind: 'catalog', id: 'example.catalog' },
  })
  expect(await store.readRecords()).toEqual([])
  await resolved.dispose()

  materializer.entry = `
    export const first = { kind: 'catalog', id: 'example.first', label: 'First', extensions: [] }
    export const second = { kind: 'catalog', id: 'example.second', label: 'Second', extensions: [] }
  `
  await expect(
    installer.resolveForAuthoring({
      target: { kind: 'npm', target: 'author-package@1' },
      selection: { kind: 'catalog', module: './entry.ts' },
      immutableBaseRoot: process.cwd(),
    }),
  ).rejects.toMatchObject({
    code: 'extension_validation_failed',
    message: expect.stringContaining('select one exact Catalog id'),
  })
})

test('Catalog-local authoring and literal replay request snapshot-metadata exclusion', async () => {
  const { materializer, store } = await fixtureService()
  const baseRoot = await mkdtemp(join(tmpdir(), 'ctxindex-catalog-root-'))
  roots.push(baseRoot)
  materializer.entry = `
    export default {
      kind: 'catalog', id: 'example.catalog', label: 'Example',
      extensions: [{ kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }]
    }
  `
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
  })
  const resolution = await installer.resolveForAuthoring({
    target: { kind: 'local', target: '.' },
    selection: { kind: 'catalog', module: 'entry.ts' },
    immutableBaseRoot: baseRoot,
  })
  expect(materializer.lastCatalogMetadataExclusion).toBe(true)
  await resolution.dispose()

  const acquired = await materializer.materialize({
    kind: 'local',
    requestedTarget: '.',
    originPath: baseRoot,
  })
  if (acquired.source.kind !== 'local') throw new TypeError('Expected local')
  const replay = {
    source: {
      kind: 'local' as const,
      requestedTarget: '.',
      path: '.',
      contentDigest: acquired.source.content_digest,
    },
    packageRoot: acquired.packageRoot,
    materializationDigest: acquired.materializationDigest,
    lock: {
      format: acquired.dependencyResolutionArtifact.format,
      path: 'ctxindex-resolutions/fixture.json',
      digest: acquired.dependencyResolutionArtifact.digest,
      byteLength: acquired.dependencyResolutionArtifact.bytes.byteLength,
    },
  }
  await acquired.cleanup()
  await installer.installExact({
    replay,
    lockBytes: acquired.dependencyResolutionArtifact.bytes,
    immutableSnapshotRoot: baseRoot,
    selection: {
      kind: 'catalog-entry',
      module: 'entry.ts',
      catalogId: 'example.catalog',
      entryIndex: 0,
      extensionId: 'example.direct',
    },
  })
  expect(materializer.lastExactCatalogMetadataExclusion).toBe(true)
})

test('Catalog authoring rejects an invalid intrinsic literal Extension registry', async () => {
  const { materializer, store } = await fixtureService()
  materializer.entry = `
    import { z } from '@ctxindex/extension-sdk'
    const invalidAdapter = {
      kind: 'adapter', id: 'example.invalid-adapter',
      configSchema: z.object({}), profiles: [], routing: 'indexed',
      capabilities: ['retrieve'], operations: { retrieve: async () => {} },
      actions: {}, access: { scopes: ['example.read'] }
    }
    export default {
      kind: 'catalog', id: 'example.catalog', label: 'Example',
      extensions: [
        { kind: 'extension', id: 'example.invalid', providers: [], oauthApps: [], profiles: [], adapters: [invalidAdapter] }
      ]
    }
  `
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: loadValidationContext(),
  })

  await expect(
    installer.resolveForAuthoring({
      target: { kind: 'npm', target: 'author-package@1' },
      selection: {
        kind: 'catalog',
        module: 'entry.ts',
        catalogId: 'example.catalog',
      },
      immutableBaseRoot: process.cwd(),
    }),
  ).rejects.toMatchObject({ code: 'extension_validation_failed' })
})

test('generic exact install owns active-state validation and atomically persists execution with same-Catalog curation replacement only', async () => {
  const { materializer, store } = await fixtureService()
  let activeStateReads = 0
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: async () => {
      activeStateReads += 1
      return loadValidationContext()()
    },
    now: () => 100,
  })
  const resolved = await installer.resolveForAuthoring({
    target: { kind: 'npm', target: 'example-package@^1' },
    selection: { kind: 'extension', extensionId: 'example.direct' },
    immutableBaseRoot: process.cwd(),
  })
  if (resolved.kind !== 'extension') throw new TypeError('Expected Extension')
  const exact = exactInstallInput(resolved)
  await resolved.dispose()
  const curation = {
    extensionId: 'example.direct',
    catalogName: 'example-catalog',
    catalogId: 'example.catalog',
    repository: 'https://example.test/catalog.git',
    commit: 'c'.repeat(40),
    snapshotAcquiredAt: 10,
    sourceLocator: { kind: 'package' as const, entryIndex: 0 },
  }
  let competingLockEntered = false
  let competingLock: Promise<void> | undefined

  const installed = await installer.installExact({
    ...exact,
    curation,
    validatePreCommit: async () => {
      expect(activeStateReads).toBe(0)
      competingLock = store.withLifecycleLock(async () => {
        competingLockEntered = true
      })
      await Bun.sleep(40)
      expect(competingLockEntered).toBe(false)
    },
  })
  await competingLock
  expect(competingLockEntered).toBe(true)
  expect(activeStateReads).toBe(1)
  expect(materializer.exactCalls).toBe(1)
  expect(installed.curation).toMatchObject({
    catalog_name: 'example-catalog',
    catalog_id: 'example.catalog',
    execution_materialization_digest: installed.materialization_digest,
    source_locator: { kind: 'package', entryIndex: 0 },
  })
  expect(installed.source).toMatchObject({
    kind: 'npm',
    package: 'fixture-package',
  })

  await expect(
    installer.installExact({
      ...exact,
      curation: {
        ...curation,
        sourceLocator: {
          kind: 'literal',
          module: 'entry.ts',
          catalogId: 'example.catalog',
          entryIndex: 0,
          extensionId: 'other.extension',
        },
      },
    }),
  ).rejects.toMatchObject({ code: 'extension_target_invalid' })

  await expect(
    installer.installExact({
      ...exact,
      curation: { ...curation, commit: 'd'.repeat(40) },
    }),
  ).resolves.toMatchObject({
    curation: { catalog_name: 'example-catalog', commit: 'd'.repeat(40) },
  })

  await expect(
    installer.installExact({
      ...exact,
      curation: {
        ...curation,
        catalogName: 'other-catalog',
        catalogId: 'other.catalog',
      },
    }),
  ).rejects.toMatchObject({ code: 'extension_conflict' })
  expect(materializer.exactCalls).toBe(3)

  const direct = new DirectExtensionService({ store, materializer })
  expect(await direct.list()).toMatchObject([
    {
      id: 'example.direct',
      curation: {
        catalog_name: 'example-catalog',
        catalog_id: 'example.catalog',
        source_locator: { kind: 'package', entryIndex: 0 },
      },
    },
  ])
  await expect(
    direct.update({
      extensionId: 'example.direct',
      loadValidationContext: loadValidationContext(),
    }),
  ).rejects.toMatchObject({
    code: 'extension_target_invalid',
    message: expect.stringContaining('Catalog-curated'),
  })

  const adapter = defineAdapter({
    id: 'catalog.adapter',
    configSchema: z.object({}),
    profiles: [],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })
  await expect(
    direct.uninstall({
      extensionId: 'example.direct',
      loadValidationContext: loadUninstallContext(
        createExtensionRegistry([
          defineExtension({ id: 'example.direct', adapters: [adapter] }),
        ]),
        [{ id: 'source-1', label: 'catalog source', adapterId: adapter.id }],
      ),
      force: false,
    }),
  ).rejects.toMatchObject({
    code: 'extension_removal_blocked',
    message: expect.stringMatching(/^Extension example\.direct /),
  })
})

test('exact replay stages concurrently and rechecks the stable-id collision under the lifecycle lock', async () => {
  const { materializer, store } = await fixtureService()
  let activeStateReads = 0
  const installer = new GenericExtensionPackageInstaller({
    store,
    materializer,
    loadActiveState: async () => {
      activeStateReads += 1
      return loadValidationContext()()
    },
  })
  const resolved = await installer.resolveForAuthoring({
    target: { kind: 'npm', target: 'example-package@^1' },
    selection: { kind: 'extension', extensionId: 'example.direct' },
    immutableBaseRoot: process.cwd(),
  })
  if (resolved.kind !== 'extension') throw new TypeError('Expected Extension')
  const exact = exactInstallInput(resolved)
  await resolved.dispose()

  let stagedCount = 0
  let markBothStaged: (() => void) | undefined
  const bothStaged = new Promise<void>((resolve) => {
    markBothStaged = resolve
  })
  let releaseReplay: (() => void) | undefined
  const replayReleased = new Promise<void>((resolve) => {
    releaseReplay = resolve
  })
  materializer.pauseExactReturn = async () => {
    stagedCount += 1
    if (stagedCount === 2) markBothStaged?.()
    await replayReleased
  }

  const attempts = [
    installer.installExact(exact),
    installer.installExact(exact),
  ]
  const replayWasConcurrent = await Promise.race([
    bothStaged.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
  ])
  const recordsBeforeRelease = await store.readRecords()
  releaseReplay?.()
  const settled = await Promise.allSettled(attempts)

  expect(recordsBeforeRelease).toEqual([])
  expect(replayWasConcurrent).toBe(true)
  expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(1)
  expect(settled.find(({ status }) => status === 'rejected')).toMatchObject({
    reason: { code: 'extension_conflict' },
  })
  expect(materializer.exactCalls).toBe(2)
  expect(materializer.cleanupCalls).toBe(3)
  expect(activeStateReads).toBe(1)
})

test('direct acquisition stages concurrently and rechecks the stable-id collision under the lifecycle lock', async () => {
  const { materializer, service, store } = await fixtureService()
  let activeStateReads = 0
  const loadActiveState = async () => {
    activeStateReads += 1
    return loadValidationContext()()
  }
  let stagedCount = 0
  let markBothStaged: (() => void) | undefined
  const bothStaged = new Promise<void>((resolve) => {
    markBothStaged = resolve
  })
  let releaseAcquisition: (() => void) | undefined
  const acquisitionReleased = new Promise<void>((resolve) => {
    releaseAcquisition = resolve
  })
  materializer.pauseMaterializeReturn = async () => {
    stagedCount += 1
    if (stagedCount === 2) markBothStaged?.()
    await acquisitionReleased
  }

  const input = {
    target: {
      kind: 'local' as const,
      requestedTarget: '/fixture',
      originPath: '/fixture',
    },
    extensionId: 'example.direct',
    loadValidationContext: loadActiveState,
  }
  const attempts = [service.install(input), service.install(input)]
  const acquisitionWasConcurrent = await Promise.race([
    bothStaged.then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 250)),
  ])
  const recordsBeforeRelease = await store.readRecords()
  releaseAcquisition?.()
  const settled = await Promise.allSettled(attempts)

  expect(recordsBeforeRelease).toEqual([])
  expect(acquisitionWasConcurrent).toBe(true)
  expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(1)
  expect(settled.find(({ status }) => status === 'rejected')).toMatchObject({
    reason: { code: 'extension_target_invalid' },
  })
  expect(materializer.calls).toBe(2)
  expect(materializer.cleanupCalls).toBe(2)
  expect(activeStateReads).toBe(1)
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

test('list fails closed for an invalid record document', async () => {
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

  expect(await service.list()).toEqual([])
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
  const laterSource = {
    id: 'source-3',
    label: 'alpha',
    adapterId: 'missing.adapter',
  }
  await expect(
    service.uninstall({
      extensionId: 'example.direct',
      loadValidationContext: loadUninstallContext(registry, [
        source,
        laterSource,
        earlierSource,
      ]),
      force: false,
    }),
  ).rejects.toMatchObject({
    code: 'extension_removal_blocked',
    blockingSources: [earlierSource, laterSource, source],
  })
  expect(await store.readRecords()).toHaveLength(1)
  const result = await service.uninstall({
    extensionId: 'example.direct',
    loadValidationContext: loadUninstallContext(registry, [
      source,
      laterSource,
      earlierSource,
    ]),
    force: true,
  })
  expect(result.blockingSources).toEqual([earlierSource, laterSource, source])
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
