import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  ExactExtensionInstallCandidate,
  GenericExtensionInstallationRecord,
} from '../direct-extension'
import { createSandbox } from '../testing'
import {
  CatalogInstallationService,
  InstalledExtensionLifecycleService,
} from './installation'
import { catalogSnapshotPath } from './paths'
import type { CatalogRecord } from './schema'

const commit = 'a'.repeat(40)
const digest = 'b'.repeat(64)
const lockBytes = new TextEncoder().encode('{"lockfileVersion":1}\n')
const lockDigest = createHash('sha256').update(lockBytes).digest('hex')
const lock = {
  format: 'bun.lock@1.3.14' as const,
  path: `ctxindex-resolutions/${lockDigest}.json`,
  digest: lockDigest,
  byteLength: lockBytes.byteLength,
}

function catalog(
  source: CatalogRecord['extensions'][number]['source'],
): CatalogRecord {
  return {
    name: 'fixture',
    repository: '/tmp/fixture.git',
    ref: 'refs/heads/main',
    commit,
    snapshot_acquired_at: 1_000,
    catalog_id: 'fixture.catalog',
    catalog_label: 'Fixture Catalog',
    generated: { packageName: '@fixture/catalog', packageVersion: '1.0.0' },
    extensions: [{ id: 'fixture.extension', source }],
  }
}

function result(
  input: ExactExtensionInstallCandidate,
): GenericExtensionInstallationRecord {
  const source =
    input.replay.source.kind === 'npm'
      ? {
          kind: 'npm' as const,
          requested_target: input.replay.source.requestedTarget,
          package: input.replay.source.package,
          exact_version: input.replay.source.version,
          integrity: input.replay.source.integrity,
        }
      : input.replay.source.kind === 'git'
        ? {
            kind: 'git' as const,
            requested_target: input.replay.source.requestedTarget,
            repository: input.replay.source.repository,
            commit: input.replay.source.commit,
          }
        : {
            kind: 'local' as const,
            requested_target: input.replay.source.requestedTarget,
            content_digest: input.replay.source.contentDigest,
          }
  return {
    id: input.selection.extensionId,
    source,
    dependency_resolution: {
      format: input.replay.lock.format,
      digest: input.replay.lock.digest,
    },
    materialization_digest: input.replay.materializationDigest,
    package_root: input.replay.packageRoot,
    installed_at: 2_000,
    updated_at: 2_000,
  }
}

async function writeSnapshot(
  dataRoot: string,
  record: CatalogRecord,
): Promise<string> {
  const root = catalogSnapshotPath(dataRoot, record.name, record.commit)
  await mkdir(join(root, 'ctxindex-resolutions'), { recursive: true })
  await mkdir(join(root, 'packages', 'local'), { recursive: true })
  await writeFile(join(root, 'index.ts'), 'export {}\n')
  await writeFile(join(root, lock.path), lockBytes)
  await writeFile(
    join(root, 'ctxindex-catalog.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      catalog: { id: record.catalog_id, label: record.catalog_label },
      generated: record.generated,
      extensions: record.extensions,
    })}\n`,
  )
  return root
}

test('installed lifecycle follows direct persisted provenance', async () => {
  const direct = result({
    replay: {
      source: {
        kind: 'npm',
        requestedTarget: '@fixture/extension@^1',
        package: '@fixture/extension',
        version: '1.0.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock,
    },
    lockBytes,
    immutableSnapshotRoot: '/unused',
    selection: { kind: 'extension', extensionId: 'fixture.extension' },
  })
  const calls: unknown[] = []
  const service = new InstalledExtensionLifecycleService({
    records: { readRecords: async () => [direct] },
    installer: {
      updateDirect: async (input) => {
        calls.push(input)
        return direct
      },
    },
    catalogInstallation: {
      install: async () => {
        throw new Error('must not use Catalog installation')
      },
    } as unknown as CatalogInstallationService,
  })

  expect(await service.update({ extensionId: direct.id })).toBe(direct)
  expect(calls).toEqual([{ extensionId: direct.id }])
})

test('installed lifecycle refreshes only the recorded Catalog curation', async () => {
  const base = result({
    replay: {
      source: {
        kind: 'npm',
        requestedTarget: '@fixture/extension@^1',
        package: '@fixture/extension',
        version: '1.0.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock,
    },
    lockBytes,
    immutableSnapshotRoot: '/unused',
    selection: { kind: 'extension', extensionId: 'fixture.extension' },
  })
  const curated: GenericExtensionInstallationRecord = {
    ...base,
    curation: {
      extension_id: base.id,
      catalog_name: 'team',
      catalog_id: 'team.catalog',
      repository: '/tmp/team.git',
      commit,
      snapshot_acquired_at: 1_000,
      source_locator: { kind: 'package', entryIndex: 0 },
      execution_materialization_digest: base.materialization_digest,
    },
  }
  let received: unknown
  const service = new InstalledExtensionLifecycleService({
    records: { readRecords: async () => [curated] },
    installer: {
      updateDirect: async () => {
        throw new Error('must not use direct update')
      },
    },
    catalogInstallation: {
      install: async (input: unknown) => {
        received = input
        return curated
      },
    } as CatalogInstallationService,
  })

  expect(await service.update({ extensionId: curated.id })).toBe(curated)
  expect(received).toEqual({
    catalog: 'team',
    extensionId: curated.id,
    expectedPrevious: curated,
  })
})

test('install invocation delegates without a redundant trust flag', async () => {
  let shows = 0
  const service = new CatalogInstallationService({
    catalogs: {
      show: async () => {
        shows += 1
        throw Object.assign(new Error('unknown Catalog'), {
          code: 'invalid_args',
        })
      },
    },
    installer: {
      installExact: async () => {
        throw new Error('must not install')
      },
    },
    dataRoot: '/unreadable',
  })

  await expect(
    service.install({
      catalog: 'fixture',
      extensionId: 'fixture.extension',
    }),
  ).rejects.toMatchObject({ code: 'invalid_args' })
  expect(shows).toBe(1)
})

test('delegates one exact package replay with structured Catalog curation', async () => {
  const sandbox = await createSandbox()
  try {
    const entryReplay = {
      source: {
        kind: 'npm' as const,
        requestedTarget: '@fixture/extension@^2',
        package: '@fixture/extension',
        version: '2.1.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock,
    }
    const record = catalog({ kind: 'package', replay: entryReplay })
    await writeSnapshot(sandbox.env.CTXINDEX_DATA_HOME, record)
    const calls: unknown[] = []
    const showRefreshes: (boolean | undefined)[] = []
    const service = new CatalogInstallationService({
      catalogs: {
        show: async (_name, options) => {
          showRefreshes.push(options?.refresh)
          return record
        },
      },
      installer: {
        installExact: async (input) => {
          calls.push(input)
          const validatePreCommit = (
            input as typeof input & {
              readonly validatePreCommit?: () => Promise<void>
            }
          ).validatePreCommit
          expect(validatePreCommit).toBeFunction()
          await validatePreCommit?.()
          return result(input)
        },
      },
      dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    })

    await service.install({
      catalog: 'fixture',
      extensionId: 'fixture.extension',
      noRefresh: true,
    })

    expect(calls).toHaveLength(1)
    expect(showRefreshes).toEqual([false, false])
    expect(calls[0]).toMatchObject({
      selection: { kind: 'extension', extensionId: 'fixture.extension' },
      replay: {
        source: {
          kind: 'npm',
          requestedTarget: '@fixture/extension@^2',
          package: '@fixture/extension',
          version: '2.1.0',
          integrity: 'sha512-fixture',
        },
      },
      curation: {
        extensionId: 'fixture.extension',
        catalogName: 'fixture',
        catalogId: 'fixture.catalog',
        sourceLocator: { kind: 'package', entryIndex: 0 },
      },
    })
    expect(calls[0]).toMatchObject({
      immutableSnapshotRoot: catalogSnapshotPath(
        sandbox.env.CTXINDEX_DATA_HOME,
        record.name,
        record.commit,
      ),
    })
  } finally {
    await sandbox.cleanup()
  }
})

test('rejects commit when the selected Catalog snapshot and exact entry changed after selection', async () => {
  const sandbox = await createSandbox()
  try {
    const entryReplay = {
      source: {
        kind: 'npm' as const,
        requestedTarget: '@fixture/extension@1',
        package: '@fixture/extension',
        version: '1.0.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock,
    }
    const selected = catalog({ kind: 'package', replay: entryReplay })
    const selectedEntry = selected.extensions[0]
    if (selectedEntry === undefined) throw new Error('Missing fixture entry')
    const replaced = {
      ...selected,
      commit: 'b'.repeat(40),
      snapshot_acquired_at: 2_000,
      extensions: [
        {
          ...selectedEntry,
          source: {
            kind: 'package' as const,
            replay: {
              ...entryReplay,
              source: { ...entryReplay.source, version: '2.0.0' },
            },
          },
        },
      ],
    }
    await writeSnapshot(sandbox.env.CTXINDEX_DATA_HOME, selected)
    let current = selected
    let installStaged: (() => void) | undefined
    const staged = new Promise<void>((resolve) => {
      installStaged = resolve
    })
    let releasePreCommit: (() => void) | undefined
    const released = new Promise<void>((resolve) => {
      releasePreCommit = resolve
    })
    const service = new CatalogInstallationService({
      catalogs: {
        show: async () => current,
      },
      installer: {
        installExact: async (input) => {
          const validatePreCommit = (
            input as typeof input & {
              readonly validatePreCommit?: () => Promise<void>
            }
          ).validatePreCommit
          installStaged?.()
          await released
          await validatePreCommit?.()
          return result(input)
        },
      },
      dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    })

    const install = service.install({
      catalog: 'fixture',
      extensionId: 'fixture.extension',
    })
    await staged
    current = replaced
    releasePreCommit?.()
    await expect(install).rejects.toMatchObject({ code: 'extension_conflict' })
  } finally {
    await sandbox.cleanup()
  }
})

test('replays literal author packages from the immutable snapshot locator', async () => {
  const sandbox = await createSandbox()
  try {
    const authorPackage = {
      source: {
        kind: 'local' as const,
        requestedTarget: '.',
        path: '.',
        contentDigest: digest,
      },
      packageRoot: 'package',
      materializationDigest: digest,
      lock,
    }
    const record = catalog({
      kind: 'literal',
      authorPackage,
      locator: {
        module: 'index.ts',
        catalogId: 'fixture.catalog',
        entryIndex: 0,
        extensionId: 'fixture.extension',
      },
    })
    const snapshot = await writeSnapshot(sandbox.env.CTXINDEX_DATA_HOME, record)
    const calls: unknown[] = []
    const service = new CatalogInstallationService({
      catalogs: { show: async () => record },
      installer: {
        installExact: async (input) => {
          calls.push(input)
          return result(input)
        },
      },
      dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    })

    await service.install({
      catalog: 'fixture',
      extensionId: 'fixture.extension',
    })

    expect(calls[0]).toMatchObject({
      selection: {
        kind: 'catalog-entry',
        module: 'index.ts',
        catalogId: 'fixture.catalog',
        entryIndex: 0,
        extensionId: 'fixture.extension',
      },
      immutableSnapshotRoot: snapshot,
      curation: {
        sourceLocator: {
          kind: 'literal',
          module: 'index.ts',
          catalogId: 'fixture.catalog',
          entryIndex: 0,
          extensionId: 'fixture.extension',
        },
      },
    })
  } finally {
    await sandbox.cleanup()
  }
})

test('rejects snapshot drift before exact install', async () => {
  const sandbox = await createSandbox()
  try {
    const entryReplay = {
      source: {
        kind: 'npm' as const,
        requestedTarget: '@fixture/extension@1',
        package: '@fixture/extension',
        version: '1.0.0',
        integrity: 'sha512-fixture',
      },
      packageRoot: 'node_modules/@fixture/extension',
      materializationDigest: digest,
      lock,
    }
    const stored = catalog({ kind: 'package', replay: entryReplay })
    const changed = catalog({
      kind: 'package',
      replay: {
        ...entryReplay,
        source: { ...entryReplay.source, version: '2.0.0' },
      },
    })
    await writeSnapshot(sandbox.env.CTXINDEX_DATA_HOME, changed)
    let installs = 0
    const service = new CatalogInstallationService({
      catalogs: { show: async () => stored },
      installer: {
        installExact: async () => {
          installs += 1
          throw new Error('must not install')
        },
      },
      dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    })

    await expect(
      service.install({
        catalog: 'fixture',
        extensionId: 'fixture.extension',
      }),
    ).rejects.toThrow('snapshot')
    expect(installs).toBe(0)
  } finally {
    await sandbox.cleanup()
  }
})
