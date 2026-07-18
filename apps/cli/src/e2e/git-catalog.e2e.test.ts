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
  await mkdir(repository, { recursive: true })
  await git(repository, ['init', '-b', 'main'])
  await writeFile(
    join(repository, 'extension.ts'),
    `export default ({ defineExtension }) => defineExtension({ id: 'fixture.catalog-extension', version: 1, profiles: [], adapters: [], docs: { summary: 'Catalog fixture' } })\n`,
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
          source: { kind: 'inline', path: 'extension.ts' },
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

test('trusted local Git Catalog lifecycle is deterministic and offline after add', async () => {
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

    const listed = await sandbox.run([
      'extensions',
      'catalog',
      'list',
      '--json',
    ])
    expect(JSON.parse(listed.stdout)).toEqual([catalog])
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
      commit: catalog.commit,
      extension: {
        id: 'fixture.catalog-extension',
        version: 1,
        source_path: 'extension.ts',
      },
    })

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
      commit: catalog.commit,
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
        commit: catalog.commit,
        repository,
        sourcePath: 'extension.ts',
      },
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
          'extension.ts',
        ),
      ).exists(),
    ).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})
