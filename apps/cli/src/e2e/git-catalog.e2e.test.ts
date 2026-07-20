import { expect, test } from 'bun:test'
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { catalogSnapshotPath } from '@ctxindex/core/catalog'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

async function git(cwd: string, args: string[]): Promise<string> {
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

async function createCatalogRepository(sandbox: Sandbox): Promise<string> {
  const repository = join(sandbox.dir, 'catalog-repository')
  const extensionPackage = join(repository, 'extension-package')
  await mkdir(repository, { recursive: true })
  await mkdir(extensionPackage)
  await git(repository, ['init', '-b', 'main'])
  await writeFile(
    join(extensionPackage, 'package.json'),
    JSON.stringify({
      name: '@fixture/catalog-extension',
      type: 'module',
      ctxindex: { extensions: ['./extension.js'] },
    }),
  )
  await writeFile(
    join(extensionPackage, 'extension.js'),
    `export const buildMarker = 'initial'\nexport default { kind: 'extension', id: 'fixture.catalog-extension', adapters: [], oauthApps: [], providers: [], profiles: [] }\n`,
  )
  await writeFile(
    join(repository, 'ctxindex-catalog.json'),
    JSON.stringify({
      schemaVersion: 1,
      catalog: {
        id: 'fixture.catalog',
        name: 'Fixture Catalog',
        summary: 'Local e2e fixture',
      },
      extensions: [
        {
          id: 'fixture.catalog-extension',
          version: 1,
          source: { kind: 'inline', path: 'extension-package' },
        },
      ],
    }),
  )
  await git(repository, ['add', '.'])
  await git(repository, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'catalog fixture',
  ])
  return repository
}

test('trusted local Git Catalog lifecycle refreshes on command and keeps startup offline', async () => {
  const sandbox = await createSandbox()
  try {
    const repository = await createCatalogRepository(sandbox)
    const missingRepositoryTrust = await sandbox.run([
      'extensions',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
    ])
    expect(missingRepositoryTrust.exitCode).toBe(2)
    expect(missingRepositoryTrust.stderr).toContain('--trust is required')

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
    expect(added.exitCode).toBe(0)
    const catalog = JSON.parse(added.stdout)
    expect(catalog).toMatchObject({
      name: 'fixture',
      catalog_id: 'fixture.catalog',
      repository,
      ref: 'refs/heads/main',
    })
    expect(catalog.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(catalog.snapshot_acquired_at).toBeNumber()
    expect(catalog.snapshot_age_ms).toBeGreaterThanOrEqual(0)

    await writeFile(join(repository, 'SETUP.md'), 'List refresh\n')
    await git(repository, ['add', 'SETUP.md'])
    await git(repository, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'list refresh',
    ])

    const staleListed = await sandbox.run([
      'extensions',
      'catalog',
      'list',
      '--no-refresh',
      '--json',
    ])
    expect(JSON.parse(staleListed.stdout)[0]).toMatchObject({
      commit: catalog.commit,
      snapshot_acquired_at: catalog.snapshot_acquired_at,
    })
    expect(JSON.parse(staleListed.stdout)[0].snapshot_age_ms).toBeNumber()
    const listed = JSON.parse(
      (await sandbox.run(['extensions', 'catalog', 'list', '--json'])).stdout,
    )[0]
    expect(listed.commit).not.toBe(catalog.commit)

    await writeFile(join(repository, 'SETUP.md'), 'Show refresh\n')
    await git(repository, ['add', 'SETUP.md'])
    await git(repository, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'show refresh',
    ])
    const staleShown = await sandbox.run([
      'extensions',
      'catalog',
      'show',
      'fixture',
      '--no-refresh',
      '--json',
    ])
    expect(JSON.parse(staleShown.stdout).commit).toBe(listed.commit)
    const shown = await sandbox.run([
      'extensions',
      'catalog',
      'show',
      'fixture',
      'fixture.catalog-extension@1',
      '--json',
    ])
    expect(JSON.parse(shown.stdout)).toMatchObject({
      catalog: 'fixture',
      extension: {
        id: 'fixture.catalog-extension',
        version: 1,
        source_path: 'extension-package',
      },
    })
    const shownValue = JSON.parse(shown.stdout)
    expect(shownValue.commit).not.toBe(listed.commit)
    expect(shownValue.snapshot_age_ms).toBeNumber()

    await writeFile(
      join(repository, 'extension-package', 'extension.js'),
      `export const buildMarker = 'refreshed'\nexport default { kind: 'extension', id: 'fixture.catalog-extension', adapters: [], oauthApps: [], providers: [], profiles: [] }\n`,
    )
    await git(repository, ['add', 'extension-package/extension.js'])
    await git(repository, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'install refresh',
    ])

    const missingInstallTrust = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog-extension@1',
    ])
    expect(missingInstallTrust.exitCode).toBe(2)
    expect(missingInstallTrust.stderr).toContain('--trust is required')
    const installed = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog-extension@1',
      '--trust',
      '--json',
    ])
    expect(installed.exitCode).toBe(0)
    expect(JSON.parse(installed.stdout)).toMatchObject({
      action: 'installed',
      id: 'fixture.catalog-extension',
    })
    const installedValue = JSON.parse(installed.stdout)
    expect(installedValue.commit).not.toBe(shownValue.commit)
    expect(installedValue.snapshot_age_ms).toBeNumber()

    await writeFile(join(repository, 'SETUP.md'), 'Not refreshed on install\n')
    await git(repository, ['add', 'SETUP.md'])
    await git(repository, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'remain stored for no-refresh install',
    ])
    const storedInstall = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog-extension@1',
      '--trust',
      '--no-refresh',
      '--json',
    ])
    expect(storedInstall.exitCode).toBe(0)
    expect(JSON.parse(storedInstall.stdout)).toMatchObject({
      commit: installedValue.commit,
      snapshot_age_ms: expect.any(Number),
    })

    const offlineBin = join(sandbox.dir, 'offline-bin')
    await mkdir(offlineBin)
    await symlink(process.execPath, join(offlineBin, 'bun'))
    const loaded = await sandbox.run(['extensions', 'list', '--json'], {
      env: { PATH: offlineBin },
    })
    expect(loaded.exitCode).toBe(0)
    const loadedExtension = JSON.parse(loaded.stdout).find(
      (entry: { id: string }) => entry.id === 'fixture.catalog-extension',
    )
    expect(loadedExtension).toMatchObject({
      id: 'fixture.catalog-extension',
      provenance: {
        kind: 'catalog',
        catalog: 'fixture',
        commit: installedValue.commit,
        repository,
        sourcePath: 'extension-package',
        snapshotAcquiredAt: installedValue.snapshot_acquired_at,
        snapshotAgeMs: expect.any(Number),
      },
    })

    const failedRefresh = await sandbox.run(
      ['extensions', 'catalog', 'show', 'fixture', '--json'],
      { env: { PATH: offlineBin } },
    )
    expect(failedRefresh.exitCode).toBe(30)
    expect(failedRefresh.stdout).toBe('')
    const offlineStored = await sandbox.run(
      ['extensions', 'catalog', 'show', 'fixture', '--no-refresh', '--json'],
      { env: { PATH: offlineBin } },
    )
    expect(offlineStored.exitCode).toBe(0)
    expect(JSON.parse(offlineStored.stdout)).toMatchObject({
      commit: installedValue.commit,
      snapshot_age_ms: expect.any(Number),
    })

    const blockedRemoval = await sandbox.run([
      'extensions',
      'catalog',
      'remove',
      'fixture',
    ])
    expect(blockedRemoval.exitCode).toBe(2)
    const uninstalled = await sandbox.run([
      'extensions',
      'uninstall',
      'fixture.catalog-extension@1',
      '--json',
    ])
    expect(uninstalled.exitCode).toBe(0)
    expect(JSON.parse(uninstalled.stdout).action).toBe('uninstalled')
    expect(
      (
        await sandbox.run([
          'extensions',
          'catalog',
          'remove',
          'fixture',
          '--json',
        ])
      ).exitCode,
    ).toBe(0)
    expect(
      await Bun.file(
        join(
          catalogSnapshotPath(
            sandbox.env.CTXINDEX_DATA_HOME,
            'fixture',
            catalog.commit,
          ),
          'extension-package',
          'extension.js',
        ),
      ).exists(),
    ).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
}, 15_000)

test('Catalog install does not print imported exception messages', async () => {
  const sandbox = await createSandbox()
  try {
    const repository = await createCatalogRepository(sandbox)
    await writeFile(
      join(repository, 'extension-package', 'extension.js'),
      `throw new Error('super-secret-value')\n`,
    )
    await git(repository, ['add', 'extension-package/extension.js'])
    await git(repository, [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-m',
      'throw during evaluation',
    ])
    await sandbox.run([
      'extensions',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
      '--trust',
    ])

    const installed = await sandbox.run([
      'extensions',
      'install',
      'fixture',
      'fixture.catalog-extension@1',
      '--trust',
    ])

    expect(installed.exitCode).toBe(50)
    expect(installed.stdout).toBe('')
    expect(installed.stderr).toContain(
      'Catalog Extension fixture.catalog-extension: Extension entry could not be evaluated',
    )
    expect(installed.stderr).not.toContain('super-secret-value')
  } finally {
    await sandbox.cleanup()
  }
}, 15_000)
