import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DirectExtensionStore } from '../direct-extension/store'
import { createSandbox, type Sandbox } from '../testing'
import {
  type AcquiredCatalogSnapshot,
  type CatalogManifest,
  CatalogService,
  catalogSnapshotPath,
} from '.'

const contentDigest = 'b'.repeat(64)

function acquiredCatalog(
  name: string,
  catalogId: string,
  commit = 'f'.repeat(40),
): AcquiredCatalogSnapshot {
  const manifest: CatalogManifest = {
    schemaVersion: 2,
    catalog: { id: catalogId, label: `${name} Catalog` },
    generated: { packageName: `@fixture/${name}`, packageVersion: '1.0.0' },
    extensions: [],
  }
  return { commit, path: `/unused/${name}/${commit}`, manifest }
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: process.env.PATH === undefined ? {} : { PATH: process.env.PATH },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(stderr)
  return stdout.trim()
}

async function commit(repository: string, message: string): Promise<string> {
  await git(repository, ['add', '.'])
  await git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    message,
  ])
  return git(repository, ['rev-parse', 'HEAD'])
}

async function createRepository(sandbox: Sandbox): Promise<string> {
  const repository = join(sandbox.dir, 'catalog-repository')
  await mkdir(join(repository, 'extension-package'), { recursive: true })
  await git(repository, ['init', '-b', 'main'])
  const lock = 'fixture bun lock\n'
  const lockPath = 'resolutions/fixture.lock'
  await mkdir(join(repository, 'resolutions'))
  await writeFile(join(repository, lockPath), lock)
  await writeFile(
    join(repository, 'extension-package', 'entry.ts'),
    `throw new Error('Catalog lifecycle must not import this module')\n`,
  )
  await writeFile(
    join(repository, 'ctxindex-catalog.json'),
    JSON.stringify({
      schemaVersion: 2,
      catalog: {
        id: 'fixture.catalog',
        label: 'Fixture Catalog',
        summary: 'Fixture summary',
      },
      generated: {
        packageName: '@ctxindex/catalog-fixture',
        packageVersion: '1.0.0',
      },
      extensions: [
        {
          id: 'fixture.extension',
          summary: 'Fixture Extension',
          source: {
            kind: 'package',
            replay: {
              source: {
                kind: 'local',
                requestedTarget: './extension-package',
                path: 'extension-package',
                contentDigest,
              },
              packageRoot: '.',
              materializationDigest: 'c'.repeat(64),
              lock: {
                format: 'bun.lock@1.3.14',
                path: lockPath,
                digest: createHash('sha256').update(lock).digest('hex'),
                byteLength: Buffer.byteLength(lock),
              },
            },
          },
        },
      ],
    }),
  )
  await commit(repository, 'initial catalog')
  return repository
}

function service(sandbox: Sandbox, now = () => 1_000): CatalogService {
  return new CatalogService({
    configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
    dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    now,
  })
}

describe('CatalogService inert lifecycle', () => {
  test('uses the generic installer record store at the same configured roots by default', async () => {
    const sandbox = await createSandbox()
    try {
      const catalogs = service(sandbox)
      expect(catalogs.installationRecords).toBeInstanceOf(DirectExtensionStore)
      expect(
        (catalogs.installationRecords as DirectExtensionStore).recordsPath,
      ).toBe(join(sandbox.env.CTXINDEX_CONFIG_HOME, 'direct-extensions.json'))
      expect(
        (catalogs.installationRecords as DirectExtensionStore)
          .materializationsRoot,
      ).toBe(
        join(
          sandbox.env.CTXINDEX_DATA_HOME,
          'direct-extensions',
          'materializations',
        ),
      )
    } finally {
      await sandbox.cleanup()
    }
  })

  test('adds a schema-v2 snapshot as inert configured Catalog state', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const added = await service(sandbox).add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      expect(added).toMatchObject({
        name: 'fixture',
        catalog_id: 'fixture.catalog',
        catalog_label: 'Fixture Catalog',
        summary: 'Fixture summary',
        generated: {
          packageName: '@ctxindex/catalog-fixture',
          packageVersion: '1.0.0',
        },
        snapshot_acquired_at: 1_000,
      })
      expect(added.extensions[0]?.source.kind).toBe('package')
      expect(
        await Bun.file(
          join(
            catalogSnapshotPath(
              sandbox.env.CTXINDEX_DATA_HOME,
              'fixture',
              added.commit,
            ),
            'extension-package',
            'entry.ts',
          ),
        ).text(),
      ).toContain('must not import')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('refreshes list by default and supports explicit stored reads', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const added = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      await writeFile(join(repository, 'README.md'), 'advanced\n')
      const advancedCommit = await commit(repository, 'advance catalog')

      expect((await catalogs.show('fixture', { refresh: false })).commit).toBe(
        added.commit,
      )
      expect((await catalogs.list())[0]?.commit).toBe(advancedCommit)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('search refreshes by default and stored search reports snapshot age', async () => {
    const sandbox = await createSandbox()
    let currentTime = 1_000
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox, () => currentTime)
      const added = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      currentTime = 1_600
      const stored = await catalogs.search('EXTENSION', { refresh: false })
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        id: 'fixture.extension',
        commit: added.commit,
        snapshotAgeMs: 600,
      })

      await writeFile(join(repository, 'README.md'), 'advanced\n')
      const advancedCommit = await commit(repository, 'advance for search')
      expect((await catalogs.search('fixture'))[0]?.commit).toBe(advancedCommit)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('shows one versionless stored Extension without executing it', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      const shown = await catalogs.showExtension(
        'fixture',
        'fixture.extension',
        { refresh: false },
      )
      expect(shown.catalog.catalog_id).toBe('fixture.catalog')
      expect(shown.extension).toMatchObject({
        id: 'fixture.extension',
        summary: 'Fixture Extension',
        source: { kind: 'package' },
      })
    } finally {
      await sandbox.cleanup()
    }
  })

  test('blocks removal using generic installed-record curation and lists stable ids', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords: {
          withLifecycleLock: async (operation) => operation(),
          readRecords: async () => [
            {
              id: 'fixture.extension',
              curation: {
                extension_id: 'fixture.extension',
                catalog_name: 'fixture',
                catalog_id: 'fixture.catalog',
                repository,
                commit: 'a'.repeat(40),
                snapshot_acquired_at: 1,
                source_locator: { kind: 'package', entryIndex: 0 },
                execution_materialization_digest: 'b'.repeat(64),
              },
            },
            { id: 'direct.extension' },
          ],
        },
      })
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      await expect(catalogs.remove('fixture')).rejects.toThrow(
        'fixture.extension',
      )
      expect(
        (await catalogs.list({ refresh: false })).map(({ name }) => name),
      ).toEqual(['fixture'])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('serializes removal with a curated install commit and then blocks removal', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const installationRecords = new DirectExtensionStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
      })
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      let lockAcquired: (() => void) | undefined
      const acquired = new Promise<void>((resolve) => {
        lockAcquired = resolve
      })
      let releaseCommit: (() => void) | undefined
      const released = new Promise<void>((resolve) => {
        releaseCommit = resolve
      })
      const commitInstall = installationRecords.withLifecycleLock(async () => {
        lockAcquired?.()
        await released
        await installationRecords.writeRecords([
          {
            id: 'fixture.extension',
            source: {
              kind: 'npm',
              requested_target: '@fixture/extension@1',
              package: '@fixture/extension',
              exact_version: '1.0.0',
              integrity: 'sha512-fixture',
            },
            dependency_resolution: {
              format: 'bun.lock@1.3.14',
              digest: 'd'.repeat(64),
            },
            materialization_digest: 'e'.repeat(64),
            package_root: 'node_modules/@fixture/extension',
            installed_at: 1,
            updated_at: 1,
            curation: {
              extension_id: 'fixture.extension',
              catalog_name: 'fixture',
              catalog_id: 'fixture.catalog',
              repository,
              commit: 'a'.repeat(40),
              snapshot_acquired_at: 1,
              source_locator: { kind: 'package', entryIndex: 0 },
              execution_materialization_digest: 'e'.repeat(64),
            },
          },
        ])
      })
      await acquired

      const removal = catalogs.remove('fixture')
      await Bun.sleep(40)
      expect(await catalogs.show('fixture', { refresh: false })).toBeDefined()
      releaseCommit?.()
      await commitInstall

      await expect(removal).rejects.toMatchObject({
        code: 'extension_conflict',
        message: expect.stringContaining('fixture.extension'),
      })
      expect(await catalogs.show('fixture', { refresh: false })).toBeDefined()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('does not resurrect a Catalog removed while refresh acquisition is paused', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const installationRecords = new DirectExtensionStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
      })
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      let acquisitionStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        acquisitionStarted = resolve
      })
      let releaseAcquisition: (() => void) | undefined
      const released = new Promise<void>((resolve) => {
        releaseAcquisition = resolve
      })
      const refreshing = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
        acquireSnapshot: async () => {
          acquisitionStarted?.()
          await released
          return acquiredCatalog('fixture', 'fixture.catalog')
        },
      })

      const refresh = refreshing.refresh({ name: 'fixture' })
      await started
      await catalogs.remove('fixture')
      releaseAcquisition?.()

      await expect(refresh).rejects.toMatchObject({ code: 'invalid_args' })
      expect(await catalogs.list({ refresh: false })).toEqual([])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('preserves both Catalogs when concurrent adds finish acquisition together', async () => {
    const sandbox = await createSandbox()
    try {
      let staged = 0
      let bothStaged: (() => void) | undefined
      const stagedTogether = new Promise<void>((resolve) => {
        bothStaged = resolve
      })
      let releaseAcquisitions: (() => void) | undefined
      const released = new Promise<void>((resolve) => {
        releaseAcquisitions = resolve
      })
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        acquireSnapshot: async ({ name }) => {
          staged += 1
          if (staged === 2) bothStaged?.()
          await released
          return acquiredCatalog(name, `${name}.catalog`)
        },
      })

      const adds = [
        catalogs.add({
          name: 'first',
          repository: '/tmp/first.git',
          ref: 'refs/heads/main',
          trust: true,
        }),
        catalogs.add({
          name: 'second',
          repository: '/tmp/second.git',
          ref: 'refs/heads/main',
          trust: true,
        }),
      ]
      await stagedTogether
      releaseAcquisitions?.()
      await Promise.all(adds)

      expect(
        (await catalogs.list({ refresh: false })).map(({ name }) => name),
      ).toEqual(['first', 'second'])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('refresh preserves a Catalog added while its acquisition is paused', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const installationRecords = new DirectExtensionStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
      })
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      let acquisitionStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        acquisitionStarted = resolve
      })
      let releaseAcquisition: (() => void) | undefined
      const released = new Promise<void>((resolve) => {
        releaseAcquisition = resolve
      })
      const refreshing = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
        acquireSnapshot: async () => {
          acquisitionStarted?.()
          await released
          return acquiredCatalog('fixture', 'fixture.catalog')
        },
      })
      const adding = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
        acquireSnapshot: async ({ name }) =>
          acquiredCatalog(name, `${name}.catalog`),
      })

      const refresh = refreshing.refresh({ name: 'fixture' })
      await started
      await adding.add({
        name: 'added',
        repository: '/tmp/added.git',
        ref: 'refs/heads/main',
        trust: true,
      })
      releaseAcquisition?.()
      await refresh

      expect(
        (await catalogs.list({ refresh: false })).map(({ name }) => name),
      ).toEqual(['added', 'fixture'])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects a refreshed Catalog id after an install committed under the lifecycle lock', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const installationRecords = new DirectExtensionStore({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
      })
      const catalogs = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
      })
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      let acquisitionStarted: (() => void) | undefined
      const started = new Promise<void>((resolve) => {
        acquisitionStarted = resolve
      })
      let releaseAcquisition: (() => void) | undefined
      const released = new Promise<void>((resolve) => {
        releaseAcquisition = resolve
      })
      const refreshing = new CatalogService({
        configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
        dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        installationRecords,
        acquireSnapshot: async () => {
          acquisitionStarted?.()
          await released
          return acquiredCatalog('fixture', 'replacement.catalog')
        },
      })

      const refresh = refreshing.refresh({ name: 'fixture' })
      await started
      await installationRecords.withLifecycleLock(async () => {
        const configured = await catalogs.show('fixture', { refresh: false })
        expect(configured.catalog_id).toBe('fixture.catalog')
        await installationRecords.writeRecords([
          {
            id: 'fixture.extension',
            source: {
              kind: 'npm',
              requested_target: '@fixture/extension@1',
              package: '@fixture/extension',
              exact_version: '1.0.0',
              integrity: 'sha512-fixture',
            },
            dependency_resolution: {
              format: 'bun.lock@1.3.14',
              digest: 'd'.repeat(64),
            },
            materialization_digest: 'e'.repeat(64),
            package_root: 'node_modules/@fixture/extension',
            installed_at: 1,
            updated_at: 1,
            curation: {
              extension_id: 'fixture.extension',
              catalog_name: 'fixture',
              catalog_id: configured.catalog_id,
              repository,
              commit: configured.commit,
              snapshot_acquired_at: configured.snapshot_acquired_at,
              source_locator: { kind: 'package', entryIndex: 0 },
              execution_materialization_digest: 'e'.repeat(64),
            },
          },
        ])
      })
      releaseAcquisition?.()

      await expect(refresh).rejects.toMatchObject({
        code: 'extension_conflict',
      })
      expect(
        (await catalogs.show('fixture', { refresh: false })).catalog_id,
      ).toBe('fixture.catalog')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('keeps the prior configured record when refreshed snapshot validation fails', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const added = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      await writeFile(join(repository, 'ctxindex-catalog.json'), '{}')
      await commit(repository, 'invalid catalog')

      await expect(catalogs.refresh({ name: 'fixture' })).rejects.toThrow()
      expect((await catalogs.show('fixture', { refresh: false })).commit).toBe(
        added.commit,
      )
    } finally {
      await sandbox.cleanup()
    }
  })

  test('removes only configured state and retains immutable snapshots', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const added = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      const snapshotManifest = join(
        catalogSnapshotPath(
          sandbox.env.CTXINDEX_DATA_HOME,
          'fixture',
          added.commit,
        ),
        'ctxindex-catalog.json',
      )

      expect(await catalogs.remove('fixture')).toEqual(added)
      expect(await catalogs.list({ refresh: false })).toEqual([])
      expect(await Bun.file(snapshotManifest).exists()).toBe(true)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('checks add trust before repository acquisition', async () => {
    const sandbox = await createSandbox()
    try {
      await expect(
        service(sandbox).add({
          name: 'fixture',
          repository: '/does/not/exist',
          ref: 'refs/heads/main',
          trust: false,
        }),
      ).rejects.toThrow('--trust')
      expect(
        await Bun.file(
          join(sandbox.env.CTXINDEX_DATA_HOME, 'catalogs'),
        ).exists(),
      ).toBe(false)
    } finally {
      await sandbox.cleanup()
    }
  })
})
