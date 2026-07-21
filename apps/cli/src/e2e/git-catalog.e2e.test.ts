import { expect, test } from 'bun:test'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { catalogSnapshotPath } from '@ctxindex/core/catalog'
import { createSandbox } from '@ctxindex/core/testing'
import {
  commitAll,
  commitEmpty,
  git,
  prepareCatalogAuthorRepository,
  prepareGitExtensionRepository,
  relocateRoot,
  startGitFixtureServer,
} from './fixtures/catalog/harness'

test('schema-v2 Git Catalog lifecycle builds, refreshes, replaces, relocates, and removes package-backed Extensions', async () => {
  const sandbox = await createSandbox()
  let gitServer: Awaited<ReturnType<typeof startGitFixtureServer>> | undefined
  try {
    const bareRepository = await prepareGitExtensionRepository(sandbox.dir)
    gitServer = await startGitFixtureServer(bareRepository)
    const repository = join(sandbox.dir, 'catalog-repository')
    await prepareCatalogAuthorRepository({
      repository,
      gitTarget: gitServer.target,
      marker: 'catalog-v1',
    })

    const missingBuildTrust = await sandbox.run([
      'extensions',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
    ])
    expect(missingBuildTrust.exitCode).toBe(2)
    expect(missingBuildTrust.stderr).toContain('--trust is required')
    expect(
      await Bun.file(join(repository, 'ctxindex-catalog.json')).exists(),
    ).toBe(false)

    const built = await sandbox.run([
      'extensions',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
      '--json',
    ])
    expect(built.exitCode, built.stderr).toBe(0)
    expect(JSON.parse(built.stdout)).toMatchObject({
      changed: true,
      outputPath: join(repository, 'ctxindex-catalog.json'),
      catalogId: 'fixture.catalog',
      extensionCount: 3,
    })
    const manifest = JSON.parse(
      await readFile(join(repository, 'ctxindex-catalog.json'), 'utf8'),
    )
    expect(manifest.schemaVersion).toBe(2)
    expect(
      manifest.extensions.map((entry: { id: string }) => entry.id),
    ).toEqual([
      'fixture.catalog.git',
      'fixture.catalog.literal',
      'fixture.catalog.local',
    ])
    expect(
      manifest.extensions.some((entry: Record<string, unknown>) =>
        Object.hasOwn(entry, 'version'),
      ),
    ).toBe(false)
    expect(
      manifest.extensions.map(
        (entry: { source: { kind: string } }) => entry.source.kind,
      ),
    ).toEqual(['package', 'literal', 'package'])

    await git(repository, ['init', '-b', 'main'])
    await commitAll(repository, 'schema-v2 Catalog fixture')

    const missingAddTrust = await sandbox.run([
      'extensions',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
    ])
    expect(missingAddTrust.exitCode).toBe(2)
    expect(missingAddTrust.stderr).toContain('--trust is required')

    const added = await sandbox.run([
      'extensions',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
      '--trust',
      '--json',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    const addedCatalog = JSON.parse(added.stdout)
    expect(addedCatalog).toMatchObject({
      name: 'fixture',
      catalog_id: 'fixture.catalog',
      catalog_label: 'Fixture Catalog',
      repository,
      ref: 'refs/heads/main',
    })
    expect(addedCatalog.commit).toMatch(/^[0-9a-f]{40}$/)

    const storedSearch = await sandbox.run([
      'extensions',
      'search',
      'fixture.catalog',
      '--no-refresh',
      '--json',
    ])
    expect(storedSearch.exitCode, storedSearch.stderr).toBe(0)
    const storedRows = JSON.parse(storedSearch.stdout)
    expect(storedRows.map((row: { id: string }) => row.id)).toEqual([
      'fixture.catalog.git',
      'fixture.catalog.literal',
      'fixture.catalog.local',
    ])
    expect(
      storedRows.map((row: { sourceKind: string }) => row.sourceKind),
    ).toEqual(['package', 'literal', 'package'])
    expect(
      storedRows.map(
        (row: { sourceLocator: { kind: string } }) => row.sourceLocator.kind,
      ),
    ).toEqual(['package', 'literal', 'package'])

    const searchCommit = await commitEmpty(repository, 'search refresh')
    expect(
      JSON.parse(
        (await sandbox.run(['extensions', 'search', '--no-refresh', '--json']))
          .stdout,
      )[0].commit,
    ).toBe(addedCatalog.commit)
    const refreshedSearch = await sandbox.run([
      'extensions',
      'search',
      '--json',
    ])
    expect(refreshedSearch.exitCode, refreshedSearch.stderr).toBe(0)
    expect(JSON.parse(refreshedSearch.stdout)[0].commit).toBe(searchCommit)

    const listCommit = await commitEmpty(repository, 'list refresh')
    const staleList = await sandbox.run([
      'extensions',
      'catalog',
      'list',
      '--no-refresh',
      '--json',
    ])
    expect(JSON.parse(staleList.stdout)[0].commit).toBe(searchCommit)
    const refreshedList = await sandbox.run([
      'extensions',
      'catalog',
      'list',
      '--json',
    ])
    expect(refreshedList.exitCode, refreshedList.stderr).toBe(0)
    expect(JSON.parse(refreshedList.stdout)[0].commit).toBe(listCommit)

    const showCommit = await commitEmpty(repository, 'show refresh')
    const staleShow = await sandbox.run([
      'extensions',
      'catalog',
      'show',
      'fixture',
      'fixture.catalog.literal',
      '--no-refresh',
      '--json',
    ])
    expect(JSON.parse(staleShow.stdout).commit).toBe(listCommit)
    const refreshedShow = await sandbox.run([
      'extensions',
      'catalog',
      'show',
      'fixture',
      'fixture.catalog.literal',
      '--json',
    ])
    expect(refreshedShow.exitCode, refreshedShow.stderr).toBe(0)
    expect(JSON.parse(refreshedShow.stdout)).toMatchObject({
      catalog: 'fixture',
      commit: showCommit,
      extension: {
        id: 'fixture.catalog.literal',
        source: {
          kind: 'literal',
          locator: {
            catalogId: 'fixture.catalog',
            extensionId: 'fixture.catalog.literal',
          },
        },
      },
    })

    const missingInstallTrust = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.literal',
    ])
    expect(missingInstallTrust.exitCode).toBe(2)
    expect(missingInstallTrust.stderr).toContain('--trust is required')

    const literalInstalled = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.literal',
      '--trust',
      '--json',
    ])
    expect(literalInstalled.exitCode, literalInstalled.stderr).toBe(0)
    const literalV1 = JSON.parse(literalInstalled.stdout)
    expect(literalV1).toMatchObject({
      action: 'installed',
      id: 'fixture.catalog.literal',
      source: { kind: 'local' },
      curation: {
        catalog_name: 'fixture',
        catalog_id: 'fixture.catalog',
        commit: showCommit,
        source_locator: {
          kind: 'literal',
          extensionId: 'fixture.catalog.literal',
        },
      },
    })

    await prepareCatalogAuthorRepository({
      repository,
      gitTarget: gitServer.target,
      marker: 'catalog-v2',
    })
    const rebuilt = await sandbox.run([
      'extensions',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
      '--json',
    ])
    expect(rebuilt.exitCode, rebuilt.stderr).toBe(0)
    expect(JSON.parse(rebuilt.stdout).changed).toBe(true)
    const replacementCommit = await commitAll(
      repository,
      'replace Catalog-authored literal',
    )
    const literalReplacement = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.literal',
      '--trust',
      '--json',
    ])
    expect(literalReplacement.exitCode, literalReplacement.stderr).toBe(0)
    const literalV2 = JSON.parse(literalReplacement.stdout)
    expect(literalV2.curation.commit).toBe(replacementCommit)
    expect(literalV2.materialization_digest).not.toBe(
      literalV1.materialization_digest,
    )

    const gitInstalled = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.git',
      '--trust',
      '--no-refresh',
      '--json',
    ])
    expect(gitInstalled.exitCode, gitInstalled.stderr).toBe(0)
    expect(JSON.parse(gitInstalled.stdout)).toMatchObject({
      id: 'fixture.catalog.git',
      source: { kind: 'git' },
      curation: {
        catalog_name: 'fixture',
        commit: replacementCommit,
        source_locator: { kind: 'package' },
      },
    })
    const localInstalled = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.local',
      '--trust',
      '--no-refresh',
      '--json',
    ])
    expect(localInstalled.exitCode, localInstalled.stderr).toBe(0)
    expect(JSON.parse(localInstalled.stdout)).toMatchObject({
      id: 'fixture.catalog.local',
      source: { kind: 'local' },
      curation: {
        catalog_name: 'fixture',
        commit: replacementCommit,
        source_locator: { kind: 'package' },
      },
    })

    const removedCuratedLocal = await sandbox.run([
      'extensions',
      'uninstall',
      'fixture.catalog.local',
      '--json',
    ])
    expect(removedCuratedLocal.exitCode, removedCuratedLocal.stderr).toBe(0)
    const directLocal = await sandbox.run([
      'extensions',
      'install',
      'local',
      join(repository, 'packages', 'local'),
      '--extension',
      'fixture.catalog.local',
      '--json',
    ])
    expect(directLocal.exitCode, directLocal.stderr).toBe(0)
    const otherOriginCollision = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.local',
      '--trust',
      '--no-refresh',
      '--json',
    ])
    expect(otherOriginCollision.exitCode).toBe(50)
    expect(otherOriginCollision.stderr).toContain('another origin')
    const removedDirectLocal = await sandbox.run([
      'extensions',
      'uninstall',
      'fixture.catalog.local',
      '--json',
    ])
    expect(removedDirectLocal.exitCode, removedDirectLocal.stderr).toBe(0)
    const restoredCuratedLocal = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog.local',
      '--trust',
      '--no-refresh',
      '--json',
    ])
    expect(restoredCuratedLocal.exitCode, restoredCuratedLocal.stderr).toBe(0)

    const blockedRemoval = await sandbox.run([
      'extensions',
      'catalog',
      'remove',
      'fixture',
    ])
    expect(blockedRemoval.exitCode).toBe(50)
    expect(blockedRemoval.stderr).toContain('while Extensions are installed')

    await gitServer.close()
    gitServer = undefined
    await rm(repository, { recursive: true, force: true })
    await rm(bareRepository, { recursive: true, force: true })

    const relocated = join(sandbox.dir, 'relocated-state')
    const relocatedEnv = {
      CTXINDEX_CONFIG_HOME: join(relocated, 'config'),
      CTXINDEX_DATA_HOME: join(relocated, 'data'),
      CTXINDEX_STATE_HOME: join(relocated, 'state'),
      CTXINDEX_CACHE_HOME: join(relocated, 'cache'),
    }
    await Promise.all([
      relocateRoot(
        sandbox.env.CTXINDEX_CONFIG_HOME,
        relocatedEnv.CTXINDEX_CONFIG_HOME,
      ),
      relocateRoot(
        sandbox.env.CTXINDEX_DATA_HOME,
        relocatedEnv.CTXINDEX_DATA_HOME,
      ),
      relocateRoot(
        sandbox.env.CTXINDEX_STATE_HOME,
        relocatedEnv.CTXINDEX_STATE_HOME,
      ),
      relocateRoot(
        sandbox.env.CTXINDEX_CACHE_HOME,
        relocatedEnv.CTXINDEX_CACHE_HOME,
      ),
    ])
    const offlineBin = join(sandbox.dir, 'offline-bin')
    await mkdir(offlineBin)
    await symlink(process.execPath, join(offlineBin, 'bun'))
    const offlineEnv = { ...relocatedEnv, PATH: offlineBin }
    const loaded = await sandbox.run(['extensions', 'list', '--json'], {
      env: offlineEnv,
    })
    expect(loaded.exitCode, loaded.stderr).toBe(0)
    for (const extensionId of [
      'fixture.catalog.literal',
      'fixture.catalog.git',
      'fixture.catalog.local',
    ]) {
      expect(loaded.stderr).not.toContain(`Extension installed:${extensionId}`)
    }
    const installed = JSON.parse(loaded.stdout).filter(
      (entry: { id: string }) => entry.id.startsWith('fixture.catalog.'),
    )
    expect(installed.map((entry: { id: string }) => entry.id)).toEqual([
      'fixture.catalog.git',
      'fixture.catalog.literal',
      'fixture.catalog.local',
    ])
    expect(
      installed.every(
        (entry: { available?: boolean }) => entry.available !== false,
      ),
    ).toBe(true)
    expect(
      installed.every(
        (entry: { provenance?: { kind?: string; catalog?: string } }) =>
          entry.provenance?.kind === 'catalog' &&
          entry.provenance.catalog === 'fixture',
      ),
    ).toBe(true)

    const failedRefresh = await sandbox.run(
      ['extensions', 'catalog', 'show', 'fixture', '--json'],
      { env: offlineEnv },
    )
    expect(failedRefresh.exitCode).toBe(30)
    const storedOffline = await sandbox.run(
      [
        'extensions',
        'catalog',
        'show',
        'fixture',
        'fixture.catalog.literal',
        '--no-refresh',
        '--json',
      ],
      { env: offlineEnv },
    )
    expect(storedOffline.exitCode, storedOffline.stderr).toBe(0)
    expect(JSON.parse(storedOffline.stdout).commit).toBe(replacementCommit)

    for (const extensionId of [
      'fixture.catalog.literal',
      'fixture.catalog.git',
      'fixture.catalog.local',
    ]) {
      const uninstalled = await sandbox.run(
        ['extensions', 'uninstall', extensionId, '--json'],
        { env: offlineEnv },
      )
      expect(uninstalled.exitCode, uninstalled.stderr).toBe(0)
      expect(JSON.parse(uninstalled.stdout)).toMatchObject({
        extension: { id: extensionId },
        forced: false,
        dataPreserved: true,
      })
    }
    const removed = await sandbox.run(
      ['extensions', 'catalog', 'remove', 'fixture', '--json'],
      { env: offlineEnv },
    )
    expect(removed.exitCode, removed.stderr).toBe(0)
    expect(JSON.parse(removed.stdout).name).toBe('fixture')
    expect(
      await Bun.file(
        join(
          catalogSnapshotPath(
            relocatedEnv.CTXINDEX_DATA_HOME,
            'fixture',
            replacementCommit,
          ),
          'ctxindex-catalog.json',
        ),
      ).exists(),
    ).toBe(true)
  } finally {
    await gitServer?.close().catch(() => undefined)
    await sandbox.cleanup()
  }
}, 90_000)

test('Catalog build redacts author exceptions and preserves the prior snapshot', async () => {
  const sandbox = await createSandbox()
  let gitServer: Awaited<ReturnType<typeof startGitFixtureServer>> | undefined
  try {
    const bareRepository = await prepareGitExtensionRepository(sandbox.dir)
    gitServer = await startGitFixtureServer(bareRepository)
    const repository = join(sandbox.dir, 'redaction-catalog')
    await prepareCatalogAuthorRepository({
      repository,
      gitTarget: gitServer.target,
      marker: 'valid',
    })
    const validBuild = await sandbox.run([
      'extensions',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
    ])
    expect(validBuild.exitCode, validBuild.stderr).toBe(0)
    const manifestPath = join(repository, 'ctxindex-catalog.json')
    const prior = await readFile(manifestPath, 'utf8')

    await writeFile(
      join(repository, 'dist', 'index.js'),
      `throw new Error('super-secret-value')\n`,
    )
    const rejected = await sandbox.run([
      'extensions',
      'catalog',
      'build',
      repository,
      '--catalog',
      'fixture.catalog',
      '--trust',
    ])
    expect(rejected.exitCode).toBe(50)
    expect(rejected.stdout).toBe('')
    expect(rejected.stderr).toContain('Extension entry could not be evaluated')
    expect(rejected.stderr).not.toContain('super-secret-value')
    expect(await readFile(manifestPath, 'utf8')).toBe(prior)
  } finally {
    await gitServer?.close().catch(() => undefined)
    await sandbox.cleanup()
  }
}, 30_000)
