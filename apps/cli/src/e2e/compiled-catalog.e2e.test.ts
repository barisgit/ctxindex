import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GenericExtensionInstallationRecord } from '@ctxindex/core'
import type {
  CatalogManifest,
  CatalogManifestEntry,
  CatalogRecord,
  CatalogReplayPayload,
} from '@ctxindex/core/catalog'
import {
  commitAll,
  git,
  prepareCatalogAuthorRepository,
  prepareGitExtensionRepository,
  relocateRoot,
  repoRoot,
  runProcess,
  startGitFixtureServer,
} from './fixtures/catalog/harness'

type InstalledOutput = GenericExtensionInstallationRecord & {
  readonly action: 'installed'
}

function replayFor(entry: CatalogManifestEntry): CatalogReplayPayload {
  return entry.source.kind === 'literal'
    ? entry.source.authorPackage
    : entry.source.replay
}

function persistedSource(
  source: CatalogReplayPayload['source'],
): GenericExtensionInstallationRecord['source'] {
  if (source.kind === 'npm') {
    return {
      kind: 'npm',
      requested_target: source.requestedTarget,
      package: source.package,
      exact_version: source.version,
      integrity: source.integrity,
    }
  }
  if (source.kind === 'git') {
    return {
      kind: 'git',
      requested_target: source.requestedTarget,
      repository: source.repository,
      commit: source.commit,
    }
  }
  return {
    kind: 'local',
    requested_target: source.requestedTarget,
    content_digest: source.contentDigest,
  }
}

function resolvedIdentity(
  source: GenericExtensionInstallationRecord['source'],
): string {
  if (source.kind === 'npm')
    return `${source.exact_version}${source.integrity === undefined ? '' : ` (${source.integrity})`}`
  if (source.kind === 'git') return source.commit
  return source.content_digest
}

function expectExactInstalledRecord(input: {
  readonly record: InstalledOutput
  readonly catalog: CatalogRecord
  readonly entry: CatalogManifestEntry
  readonly entryIndex: number
}): void {
  const replay = replayFor(input.entry)
  const sourceLocator =
    input.entry.source.kind === 'literal'
      ? { kind: 'literal' as const, ...input.entry.source.locator }
      : { kind: 'package' as const, entryIndex: input.entryIndex }
  expect(input.record.action).toBe('installed')
  expect(input.record.id).toBe(input.entry.id)
  expect(input.record.source).toEqual(persistedSource(replay.source))
  expect(input.record.dependency_resolution).toEqual({
    format: replay.lock.format,
    digest: replay.lock.digest,
  })
  expect(input.record.materialization_digest).toBe(replay.materializationDigest)
  expect(input.record.package_root).toBe(replay.packageRoot)
  expect(input.record.curation).toEqual({
    extension_id: input.entry.id,
    catalog_name: input.catalog.name,
    catalog_id: input.catalog.catalog_id,
    repository: input.catalog.repository,
    commit: input.catalog.commit,
    snapshot_acquired_at: input.catalog.snapshot_acquired_at,
    source_locator: sourceLocator,
    execution_materialization_digest: replay.materializationDigest,
  })
}

test('relocated compiled CLI builds and replays a mixed schema-v2 Catalog from managed bytes offline', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-catalog-'))
  const buildPath = join(sandbox, 'build', 'ctxindex')
  const relocatedPath = join(sandbox, 'relocated', 'ctxindex')
  let gitServer: Awaited<ReturnType<typeof startGitFixtureServer>> | undefined
  try {
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    const bareRepository = await prepareGitExtensionRepository(sandbox)
    gitServer = await startGitFixtureServer(bareRepository)
    const repository = join(sandbox, 'catalog-repository')
    await prepareCatalogAuthorRepository({
      repository,
      gitTarget: gitServer.target,
      marker: 'compiled-v1',
    })

    const compiled = await runProcess(
      [
        'bun',
        'build',
        '--compile',
        'apps/cli/bin/ctxindex.mjs',
        '--outfile',
        buildPath,
      ],
      { cwd: repoRoot },
    )
    expect(compiled.exitCode, `${compiled.stdout}\n${compiled.stderr}`).toBe(0)
    await Bun.write(relocatedPath, Bun.file(buildPath))
    await chmod(relocatedPath, 0o755)
    await rm(join(sandbox, 'build'), { recursive: true })

    const initialRoots = {
      CTXINDEX_CONFIG_HOME: join(sandbox, 'config'),
      CTXINDEX_DATA_HOME: join(sandbox, 'data'),
      CTXINDEX_STATE_HOME: join(sandbox, 'state'),
      CTXINDEX_CACHE_HOME: join(sandbox, 'cache'),
    }
    const baseEnv = {
      ...process.env,
      ...initialRoots,
      NODE_ENV: 'test',
      CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox, 'keytar.json'),
    }
    const run = (args: readonly string[], env = baseEnv) =>
      runProcess([relocatedPath, ...args], { cwd: '/', env })

    const built = await run([
      'extension',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
      '--format',
      'json',
    ])
    expect(built.exitCode, built.stderr).toBe(0)
    expect(JSON.parse(built.stdout)).toMatchObject({
      changed: true,
      catalogId: 'fixture.catalog',
      extensionCount: 3,
    })
    const initialManifest = JSON.parse(
      await readFile(join(repository, 'ctxindex-catalog.json'), 'utf8'),
    ) as CatalogManifest
    const initialEntries = new Map(
      initialManifest.extensions.map((entry) => [entry.id, entry]),
    )
    const initialGit = initialEntries.get('fixture.catalog.git')
    const initialLiteral = initialEntries.get('fixture.catalog.literal')
    const initialLocal = initialEntries.get('fixture.catalog.local')
    expect(initialGit?.source).toMatchObject({
      kind: 'package',
      replay: {
        source: {
          kind: 'git',
          requestedTarget: gitServer.target,
          repository: gitServer.target.replace(/#.*$/, ''),
          commit: gitServer.target.replace(/^.*#/, ''),
        },
      },
    })
    expect(initialLiteral?.source).toMatchObject({
      kind: 'literal',
      authorPackage: {
        source: {
          kind: 'local',
          requestedTarget: '.',
          path: '.',
          contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
      locator: {
        module: 'dist/index.js',
        catalogId: 'fixture.catalog',
        entryIndex: 0,
        extensionId: 'fixture.catalog.literal',
      },
    })
    expect(initialLocal?.source).toMatchObject({
      kind: 'package',
      replay: {
        source: {
          kind: 'local',
          requestedTarget: 'packages/local',
          path: 'packages/local',
          contentDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        },
      },
    })

    await git(repository, ['init', '-b', 'main'])
    await commitAll(repository, 'compiled schema-v2 Catalog')
    const added = await run([
      'extension',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
      '--trust',
      '--format',
      'json',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    const initialCatalog = JSON.parse(added.stdout) as CatalogRecord

    const initialSearch = await run([
      'extension',
      'catalog',
      'search',
      'fixture.catalog',
      '--no-refresh',
      '--format',
      'json',
    ])
    expect(initialSearch.exitCode, initialSearch.stderr).toBe(0)
    expect(
      JSON.parse(initialSearch.stdout).map(
        (row: { id: string; sourceKind: string }) => [row.id, row.sourceKind],
      ),
    ).toEqual([
      ['fixture.catalog.git', 'package'],
      ['fixture.catalog.literal', 'literal'],
      ['fixture.catalog.local', 'package'],
    ])

    const installedFinal = new Map<string, InstalledOutput>()
    for (const extensionId of [
      'fixture.catalog.literal',
      'fixture.catalog.git',
      'fixture.catalog.local',
    ]) {
      const installed = await run([
        'extension',
        'install',
        'catalog',
        'fixture',
        extensionId,
        '--no-refresh',
        '--format',
        'json',
      ])
      expect(installed.exitCode, installed.stderr).toBe(0)
      const value = JSON.parse(installed.stdout) as InstalledOutput
      const entryIndex = initialManifest.extensions.findIndex(
        (entry) => entry.id === extensionId,
      )
      const entry = initialManifest.extensions[entryIndex]
      expect(entry).toBeDefined()
      expectExactInstalledRecord({
        record: value,
        catalog: initialCatalog,
        entry: entry as CatalogManifestEntry,
        entryIndex,
      })
      installedFinal.set(extensionId, value)
    }

    await prepareCatalogAuthorRepository({
      repository,
      gitTarget: gitServer.target,
      marker: 'compiled-v2',
    })
    const rebuilt = await run([
      'extension',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
      '--format',
      'json',
    ])
    expect(rebuilt.exitCode, rebuilt.stderr).toBe(0)
    const replacementManifest = JSON.parse(
      await readFile(join(repository, 'ctxindex-catalog.json'), 'utf8'),
    ) as CatalogManifest
    const replacementCommit = await commitAll(
      repository,
      'compiled replacement',
    )
    const refreshed = await run([
      'extension',
      'catalog',
      'refresh',
      'fixture',
      '--format',
      'json',
    ])
    expect(refreshed.exitCode, refreshed.stderr).toBe(0)
    const replacementCatalog = JSON.parse(refreshed.stdout) as CatalogRecord
    expect(replacementCatalog.commit).toBe(replacementCommit)
    const refreshedSearch = await run([
      'extension',
      'catalog',
      'search',
      'fixture.catalog',
      '--no-refresh',
      '--format',
      'json',
    ])
    expect(refreshedSearch.exitCode, refreshedSearch.stderr).toBe(0)
    expect(
      JSON.parse(refreshedSearch.stdout).map(
        (row: { id: string; commit: string }) => [row.id, row.commit],
      ),
    ).toEqual([
      ['fixture.catalog.git', replacementCommit],
      ['fixture.catalog.literal', replacementCommit],
      ['fixture.catalog.local', replacementCommit],
    ])
    const replacement = await run([
      'extension',
      'install',
      'catalog',
      'fixture',
      'fixture.catalog.literal',
      '--no-refresh',
      '--format',
      'json',
    ])
    expect(replacement.exitCode, replacement.stderr).toBe(0)
    const replacementValue = JSON.parse(replacement.stdout) as InstalledOutput
    const replacementLiteralIndex = replacementManifest.extensions.findIndex(
      (entry) => entry.id === 'fixture.catalog.literal',
    )
    const replacementLiteral =
      replacementManifest.extensions[replacementLiteralIndex]
    expect(replacementLiteral).toBeDefined()
    expectExactInstalledRecord({
      record: replacementValue,
      catalog: replacementCatalog,
      entry: replacementLiteral as CatalogManifestEntry,
      entryIndex: replacementLiteralIndex,
    })
    expect(replacementValue.materialization_digest).not.toBe(
      installedFinal.get('fixture.catalog.literal')?.materialization_digest,
    )
    installedFinal.set('fixture.catalog.literal', replacementValue)

    const removedCuratedLocal = await run([
      'extension',
      'uninstall',
      'fixture.catalog.local',
      '--format',
      'json',
    ])
    expect(removedCuratedLocal.exitCode, removedCuratedLocal.stderr).toBe(0)
    const directLocal = await run([
      'extension',
      'install',
      'local',
      join(repository, 'packages', 'local'),
      'fixture.catalog.local',
      '--format',
      'json',
    ])
    expect(directLocal.exitCode, directLocal.stderr).toBe(0)
    const otherOriginCollision = await run([
      'extension',
      'install',
      'catalog',
      'fixture',
      'fixture.catalog.local',
      '--no-refresh',
      '--format',
      'json',
    ])
    expect(otherOriginCollision.exitCode).toBe(50)
    expect(otherOriginCollision.stderr).toContain('another origin')
    const removedDirectLocal = await run([
      'extension',
      'uninstall',
      'fixture.catalog.local',
      '--format',
      'json',
    ])
    expect(removedDirectLocal.exitCode, removedDirectLocal.stderr).toBe(0)
    const restoredCuratedLocal = await run([
      'extension',
      'install',
      'catalog',
      'fixture',
      'fixture.catalog.local',
      '--no-refresh',
      '--format',
      'json',
    ])
    expect(restoredCuratedLocal.exitCode, restoredCuratedLocal.stderr).toBe(0)
    const restoredLocalValue = JSON.parse(
      restoredCuratedLocal.stdout,
    ) as InstalledOutput
    const replacementLocalIndex = replacementManifest.extensions.findIndex(
      (entry) => entry.id === 'fixture.catalog.local',
    )
    const replacementLocal =
      replacementManifest.extensions[replacementLocalIndex]
    expect(replacementLocal).toBeDefined()
    expectExactInstalledRecord({
      record: restoredLocalValue,
      catalog: replacementCatalog,
      entry: replacementLocal as CatalogManifestEntry,
      entryIndex: replacementLocalIndex,
    })
    installedFinal.set('fixture.catalog.local', restoredLocalValue)

    await gitServer.close()
    gitServer = undefined
    await rm(repository, { recursive: true, force: true })
    await rm(bareRepository, { recursive: true, force: true })

    const relocatedRoots = {
      CTXINDEX_CONFIG_HOME: join(sandbox, 'relocated-state', 'config'),
      CTXINDEX_DATA_HOME: join(sandbox, 'relocated-state', 'data'),
      CTXINDEX_STATE_HOME: join(sandbox, 'relocated-state', 'state'),
      CTXINDEX_CACHE_HOME: join(sandbox, 'relocated-state', 'cache'),
    }
    await Promise.all([
      relocateRoot(
        initialRoots.CTXINDEX_CONFIG_HOME,
        relocatedRoots.CTXINDEX_CONFIG_HOME,
      ),
      relocateRoot(
        initialRoots.CTXINDEX_DATA_HOME,
        relocatedRoots.CTXINDEX_DATA_HOME,
      ),
      relocateRoot(
        initialRoots.CTXINDEX_STATE_HOME,
        relocatedRoots.CTXINDEX_STATE_HOME,
      ),
      relocateRoot(
        initialRoots.CTXINDEX_CACHE_HOME,
        relocatedRoots.CTXINDEX_CACHE_HOME,
      ),
    ])
    const offlineBin = join(sandbox, 'offline-bin')
    await mkdir(offlineBin)
    const offlineEnv = {
      ...baseEnv,
      ...relocatedRoots,
      PATH: offlineBin,
      BUN_CONFIG_REGISTRY: 'http://127.0.0.1:1',
    }
    const loaded = await run(
      ['extension', 'list', '--format', 'json'],
      offlineEnv,
    )
    expect(loaded.exitCode, loaded.stderr).toBe(0)
    for (const extensionId of [
      'fixture.catalog.literal',
      'fixture.catalog.git',
      'fixture.catalog.local',
    ]) {
      expect(loaded.stderr).not.toContain(`Extension installed:${extensionId}`)
    }
    const loadedCatalogExtensions = JSON.parse(loaded.stdout).filter(
      (entry: { id: string }) => entry.id.startsWith('fixture.catalog.'),
    )
    expect(
      loadedCatalogExtensions.map((entry: { id: string }) => entry.id),
    ).toEqual([
      'fixture.catalog.git',
      'fixture.catalog.literal',
      'fixture.catalog.local',
    ])
    expect(
      loadedCatalogExtensions.every(
        (entry: { available?: boolean }) => entry.available !== false,
      ),
    ).toBe(true)
    const loadedById = new Map(
      loadedCatalogExtensions.map((entry: { id: string }) => [entry.id, entry]),
    )
    for (const [extensionId, record] of installedFinal) {
      const curation = record.curation
      expect(curation).toBeDefined()
      expect(loadedById.get(extensionId)).toEqual({
        id: extensionId,
        profiles: [],
        adapters: [],
        provenance: {
          id: extensionId,
          kind: 'catalog',
          catalog: curation?.catalog_name,
          catalogId: curation?.catalog_id,
          repository: curation?.repository,
          commit: curation?.commit,
          snapshotAcquiredAt: curation?.snapshot_acquired_at,
          snapshotAgeMs: expect.any(Number),
          sourceLocator: curation?.source_locator,
          sourceKind: record.source.kind,
          requestedTarget: record.source.requested_target,
          resolvedIdentity: resolvedIdentity(record.source),
          materializationDigest: record.materialization_digest,
          installedAt: record.installed_at,
          updatedAt: record.updated_at,
        },
      })
    }
    const storedCatalog = await run(
      [
        'extension',
        'catalog',
        'show',
        'fixture',
        '--no-refresh',
        '--format',
        'json',
      ],
      offlineEnv,
    )
    expect(storedCatalog.exitCode, storedCatalog.stderr).toBe(0)
    expect(JSON.parse(storedCatalog.stdout).commit).toBe(replacementCommit)

    for (const extensionId of [
      'fixture.catalog.literal',
      'fixture.catalog.git',
      'fixture.catalog.local',
    ]) {
      const uninstalled = await run(
        ['extension', 'uninstall', extensionId, '--format', 'json'],
        offlineEnv,
      )
      expect(uninstalled.exitCode, uninstalled.stderr).toBe(0)
      expect(JSON.parse(uninstalled.stdout)).toMatchObject({
        extension: { id: extensionId },
        forced: false,
        dataPreserved: true,
      })
    }
    const removed = await run(
      ['extension', 'catalog', 'remove', 'fixture', '--format', 'json'],
      offlineEnv,
    )
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(JSON.parse(removed.stdout).name).toBe('fixture')
  } finally {
    await gitServer?.close().catch(() => undefined)
    await rm(sandbox, { recursive: true, force: true })
  }
}, 90_000)
