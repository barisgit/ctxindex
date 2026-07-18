import { describe, expect, test } from 'bun:test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { defineExtension, defineProfile } from '@ctxindex/extension-sdk'
import * as TOML from '@iarna/toml'
import { z } from 'zod'
import { createExtensionRegistry } from '../registry'
import { createSandbox, type Sandbox } from '../testing'
import {
  acquireCatalogSnapshot,
  CatalogService,
  catalogSnapshotPath,
  validateCatalogRef,
  validateCatalogRepository,
} from '.'

async function git(cwd: string, args: string[]): Promise<string> {
  const process = Bun.spawn(['git', ...args], {
    cwd,
    env: processEnv(),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(stderr)
  return stdout.trim()
}

function processEnv(): Record<string, string> {
  return process.env.PATH === undefined ? {} : { PATH: process.env.PATH }
}

async function createRepository(
  sandbox: Sandbox,
  extensionSource = `export default ({ defineExtension }) => defineExtension({ id: 'fixture.extension', version: 1, profiles: [], adapters: [] })\n`,
): Promise<string> {
  const repository = join(sandbox.dir, 'catalog-repository')
  await mkdir(repository, { recursive: true })
  await git(repository, ['init', '-b', 'main'])
  await writeFile(join(repository, 'extension.ts'), extensionSource)
  await writeFile(join(repository, 'SETUP.md'), 'Fixture setup\n')
  await writeFile(
    join(repository, 'ctxindex-catalog.json'),
    JSON.stringify({
      schemaVersion: 1,
      catalog: { id: 'fixture.catalog', name: 'Fixture Catalog' },
      extensions: [
        {
          id: 'fixture.extension',
          version: 1,
          source: { kind: 'inline', path: 'extension.ts' },
          setup: { path: 'SETUP.md' },
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
    'initial catalog',
  ])
  return repository
}

function service(sandbox: Sandbox, now?: () => number): CatalogService {
  return new CatalogService({
    configRoot: sandbox.env.CTXINDEX_CONFIG_HOME,
    dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
    ...(now === undefined ? {} : { now }),
  })
}

describe('Catalog repository policy', () => {
  test.each([
    'http://example.com/catalog.git',
    'ssh://example.com/catalog.git',
    'https://user@example.com/catalog.git',
    'https://localhost/catalog.git',
    'https://localhost./catalog.git',
    'https://catalog.localhost./catalog.git',
    'https://127.0.0.1/catalog.git',
    'https://10.0.0.1/catalog.git',
    'https://169.254.1.2/catalog.git',
    'https://[::1]/catalog.git',
    'https://[::ffff:127.0.0.1]/catalog.git',
    'https://[fc00::1]/catalog.git',
    'https://[fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/catalog.git',
    'https://[fe80::1]/catalog.git',
    'https://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/catalog.git',
    'https://[fec0::1]/catalog.git',
    'https://[feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff]/catalog.git',
    'relative/catalog.git',
  ])('rejects unsafe repository %s', (repository) => {
    expect(() => validateCatalogRepository(repository)).toThrow()
  })

  test('rejects URL query and fragment values without echoing them', () => {
    for (const repository of [
      'https://example.com/catalog.git?token=opaque-value',
      'https://example.com/catalog.git#token=opaque-value',
    ]) {
      try {
        validateCatalogRepository(repository)
        throw new Error('Expected repository validation to fail')
      } catch (cause) {
        expect(cause).toBeInstanceOf(TypeError)
        expect((cause as Error).message).toBe(
          'Catalog remote repository must be credential-free HTTPS',
        )
        expect((cause as Error).message).not.toContain('opaque-value')
      }
    }
  })

  test('accepts public HTTPS and absolute local repositories', () => {
    expect(validateCatalogRepository('https://example.com/catalog.git')).toBe(
      'https://example.com/catalog.git',
    )
    expect(isAbsolute(validateCatalogRepository('/tmp/catalog.git'))).toBe(true)
  })

  test.each([
    'main',
    'v1',
    'refs/pull/1/head',
    'abc123',
    'refs/heads/a/.hidden',
    'refs/heads/a/.',
    'refs/heads/a/end.',
    'refs/tags/v1.lock',
  ])('rejects non-full ref %s', (ref) =>
    expect(() => validateCatalogRef(ref)).toThrow())
})

describe('CatalogService lifecycle', () => {
  test('treats concurrent publication of the same immutable snapshot as success', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const acquire = () =>
        acquireCatalogSnapshot({
          repository,
          ref: 'refs/heads/main',
          name: 'fixture',
          dataRoot: sandbox.env.CTXINDEX_DATA_HOME,
        })

      const [first, second] = await Promise.all([acquire(), acquire()])

      expect(second.commit).toBe(first.commit)
      expect(second.path).toBe(first.path)
      expect(second.manifest).toEqual(first.manifest)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('rejects corrupted persisted acquisition fields before invoking Git', async () => {
    const sandbox = await createSandbox()
    try {
      await mkdir(sandbox.env.CTXINDEX_CONFIG_HOME, { recursive: true })
      await writeFile(
        join(sandbox.env.CTXINDEX_CONFIG_HOME, 'catalogs.toml'),
        TOML.stringify({
          schema_version: 1,
          catalogs: [
            {
              name: 'fixture',
              repository: 'https://user@example.com/catalog.git',
              ref: '--upload-pack=credential-helper',
              commit: 'a'.repeat(40),
              snapshot_acquired_at: 1,
              catalog_id: 'fixture.catalog',
              catalog_name: 'Fixture Catalog',
              extensions: [
                {
                  id: 'fixture.extension',
                  version: 1,
                  source_path: 'extension.ts',
                },
              ],
            },
          ],
        } as Parameters<typeof TOML.stringify>[0]),
      )

      await expect(
        service(sandbox).refresh({ name: 'fixture' }),
      ).rejects.toThrow()
      await expect(
        readdir(join(sandbox.env.CTXINDEX_DATA_HOME, 'catalogs')),
      ).rejects.toThrow()
    } finally {
      await sandbox.cleanup()
    }
  })

  test('adds a full branch ref as an immutable committed-object snapshot', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      await writeFile(
        join(repository, 'extension.ts'),
        'uncommitted and invalid',
      )

      const added = await service(sandbox).add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      expect(added.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(added.catalog_id).toBe('fixture.catalog')
      const snapshot = catalogSnapshotPath(
        sandbox.env.CTXINDEX_DATA_HOME,
        'fixture',
        added.commit,
      )
      expect(
        await Bun.file(join(snapshot, 'extension.ts')).text(),
      ).not.toContain('uncommitted')
      expect((await service(sandbox).list()).map(({ name }) => name)).toEqual([
        'fixture',
      ])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('persists the acquisition time of each exact snapshot', async () => {
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
      expect(added.snapshot_acquired_at).toBe(1_000)

      currentTime = 2_000
      const refreshed = await catalogs.refresh({ name: 'fixture' })
      expect(refreshed.snapshot_acquired_at).toBe(2_000)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('ignores hostile ambient Git configuration during acquisition', async () => {
    const sandbox = await createSandbox()
    const previousGlobalConfig = process.env.GIT_CONFIG_GLOBAL
    try {
      const repository = await createRepository(sandbox)
      const credentialMarker = join(sandbox.dir, 'credential-helper-ran')
      const hostileConfig = join(sandbox.dir, 'hostile.gitconfig')
      await writeFile(
        hostileConfig,
        `[protocol "file"]\n\tallow = never\n[credential]\n\thelper = !touch ${credentialMarker}\n[core]\n\thooksPath = ${join(sandbox.dir, 'hostile-hooks')}\n`,
      )
      process.env.GIT_CONFIG_GLOBAL = hostileConfig

      const added = await service(sandbox).add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })

      expect(added.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(await Bun.file(credentialMarker).exists()).toBe(false)
    } finally {
      if (previousGlobalConfig === undefined) {
        delete process.env.GIT_CONFIG_GLOBAL
      } else {
        process.env.GIT_CONFIG_GLOBAL = previousGlobalConfig
      }
      await sandbox.cleanup()
    }
  })

  test('accepts an exact commit OID and rejects duplicate Catalog IDs', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const oid = await git(repository, ['rev-parse', 'HEAD'])
      const catalogs = service(sandbox)
      await catalogs.add({ name: 'first', repository, ref: oid, trust: true })
      await expect(
        catalogs.add({ name: 'second', repository, ref: oid, trust: true }),
      ).rejects.toThrow('Catalog id fixture.catalog is already registered')
    } finally {
      await sandbox.cleanup()
    }
  })

  test('refresh advances only the Catalog pin after candidate validation', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const before = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      await writeFile(join(repository, 'SETUP.md'), 'Updated setup\n')
      await git(repository, ['add', 'SETUP.md'])
      await git(repository, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'refresh catalog',
      ])
      const after = await catalogs.refresh({ name: 'fixture' })
      expect(after.commit).not.toBe(before.commit)

      await writeFile(join(repository, 'ctxindex-catalog.json'), '{}')
      await git(repository, ['add', 'ctxindex-catalog.json'])
      await git(repository, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'invalid catalog',
      ])
      await expect(catalogs.refresh({ name: 'fixture' })).rejects.toThrow()
      expect((await catalogs.show('fixture')).commit).toBe(after.commit)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('refreshes Catalog reads only when the caller requests fresh discovery', async () => {
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
      await writeFile(join(repository, 'SETUP.md'), 'Updated setup\n')
      await git(repository, ['add', 'SETUP.md'])
      await git(repository, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'update catalog',
      ])

      expect((await catalogs.list({ refresh: false }))[0]?.commit).toBe(
        added.commit,
      )
      expect((await catalogs.list({ refresh: true }))[0]?.commit).not.toBe(
        added.commit,
      )
    } finally {
      await sandbox.cleanup()
    }
  })

  test('remove refuses installed references and retains snapshots', async () => {
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
      await catalogs.store.writeInstalled([
        {
          id: 'fixture.extension',
          version: 1,
          catalog_name: 'fixture',
          catalog_id: 'fixture.catalog',
          repository,
          commit: added.commit,
          snapshot_acquired_at: added.snapshot_acquired_at,
          source_path: 'extension.ts',
          setup_path: 'SETUP.md',
        },
      ])
      await expect(catalogs.remove('fixture')).rejects.toThrow(
        'still installed',
      )
      await catalogs.store.writeInstalled([])
      await catalogs.remove('fixture')
      expect(await catalogs.list()).toEqual([])
      expect(
        await Bun.file(
          join(
            catalogSnapshotPath(
              sandbox.env.CTXINDEX_DATA_HOME,
              'fixture',
              added.commit,
            ),
            'ctxindex-catalog.json',
          ),
        ).exists(),
      ).toBe(true)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('installs only after separate trust, is idempotent, and uninstalls metadata only', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const catalog = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      await expect(
        catalogs.install({
          catalog: 'fixture',
          id: 'fixture.extension',
          version: 1,
          trust: false,
          registry: createExtensionRegistry(),
        }),
      ).rejects.toThrow('--trust')

      const first = await catalogs.install({
        catalog: 'fixture',
        id: 'fixture.extension',
        version: 1,
        trust: true,
        registry: createExtensionRegistry(),
      })
      const second = await catalogs.install({
        catalog: 'fixture',
        id: 'fixture.extension',
        version: 1,
        trust: true,
        registry: createExtensionRegistry(),
      })
      expect(second).toEqual(first)
      expect(first.commit).toBe(catalog.commit)
      expect(await catalogs.store.readInstalled()).toEqual([first])

      const snapshot = catalogSnapshotPath(
        sandbox.env.CTXINDEX_DATA_HOME,
        'fixture',
        catalog.commit,
      )
      await catalogs.uninstall({ id: 'fixture.extension', version: 1 })
      expect(await catalogs.store.readInstalled()).toEqual([])
      expect(await Bun.file(join(snapshot, 'extension.ts')).exists()).toBe(true)
    } finally {
      await sandbox.cleanup()
    }
  })

  test('validates install against the complete runtime registry', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(
        sandbox,
        `export default ({ defineAdapter, defineExtension, z }) => defineExtension({
  id: 'fixture.extension',
  version: 1,
  profiles: [],
  adapters: [defineAdapter({
    id: 'fixture.adapter',
    version: 1,
    configSchema: z.object({}),
    auth: { kind: 'none' },
    profiles: [{ id: 'fixture.shared', version: 1 }],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  })],
})\n`,
      )
      const catalogs = service(sandbox)
      await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      const sharedProfile = defineProfile({
        id: 'fixture.shared',
        version: 1,
        schema: z.object({}),
        docs: { summary: 'Shared runtime Profile' },
      })
      const registry = createExtensionRegistry([
        defineExtension({
          id: 'fixture.runtime',
          version: 1,
          profiles: [sharedProfile],
          adapters: [],
        }),
      ])

      await expect(
        catalogs.install({
          catalog: 'fixture',
          id: 'fixture.extension',
          version: 1,
          trust: true,
          registry,
        }),
      ).resolves.toMatchObject({ id: 'fixture.extension', version: 1 })
    } finally {
      await sandbox.cleanup()
    }
  })

  test.each([
    'builtin',
    'path',
  ] as const)('rejects install identity conflicts with a loaded %s Extension', async () => {
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
      const conflicting = defineExtension({
        id: 'fixture.extension',
        version: 1,
        profiles: [],
        adapters: [],
      })

      await expect(
        catalogs.install({
          catalog: 'fixture',
          id: 'fixture.extension',
          version: 1,
          trust: true,
          registry: createExtensionRegistry([conflicting]),
        }),
      ).rejects.toThrow('Duplicate Extension fixture.extension@1')
      expect(await catalogs.store.readInstalled()).toEqual([])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('replaces only the exact previously loaded Catalog provenance', async () => {
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
      const original = await catalogs.install({
        catalog: 'fixture',
        id: 'fixture.extension',
        version: 1,
        trust: true,
        registry: createExtensionRegistry(),
      })
      await writeFile(join(repository, 'SETUP.md'), 'Re-pinned setup\n')
      await git(repository, ['add', 'SETUP.md'])
      await git(repository, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        're-pin extension',
      ])
      const refreshed = await catalogs.refresh({ name: 'fixture' })
      const loadedCatalogDefinition = defineExtension({
        id: 'fixture.extension',
        version: 1,
        profiles: [],
        adapters: [],
      })

      const replacement = await catalogs.install({
        catalog: 'fixture',
        id: 'fixture.extension',
        version: 1,
        trust: true,
        registry: createExtensionRegistry([loadedCatalogDefinition]),
        replaceableCatalog: {
          catalog: original.catalog_name,
          commit: original.commit,
        },
      })

      expect(replacement.commit).toBe(refreshed.commit)
      expect(replacement.commit).not.toBe(original.commit)
      expect(await catalogs.store.readInstalled()).toEqual([replacement])
    } finally {
      await sandbox.cleanup()
    }
  })

  test('refresh does not replace installed provenance and invalid replacement is atomic', async () => {
    const sandbox = await createSandbox()
    try {
      const repository = await createRepository(sandbox)
      const catalogs = service(sandbox)
      const originalCatalog = await catalogs.add({
        name: 'fixture',
        repository,
        ref: 'refs/heads/main',
        trust: true,
      })
      const originalInstall = await catalogs.install({
        catalog: 'fixture',
        id: 'fixture.extension',
        version: 1,
        trust: true,
        registry: createExtensionRegistry(),
      })
      await writeFile(
        join(repository, 'extension.ts'),
        `export default ({ defineExtension }) => defineExtension({ id: 'wrong.extension', version: 1, profiles: [], adapters: [] })\n`,
      )
      await git(repository, ['add', 'extension.ts'])
      await git(repository, [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-m',
        'identity mismatch',
      ])
      const refreshed = await catalogs.refresh({ name: 'fixture' })
      expect(refreshed.commit).not.toBe(originalCatalog.commit)
      expect(await catalogs.store.readInstalled()).toEqual([originalInstall])

      await expect(
        catalogs.install({
          catalog: 'fixture',
          id: 'fixture.extension',
          version: 1,
          trust: true,
          registry: createExtensionRegistry(),
        }),
      ).rejects.toThrow('identity')
      expect(await catalogs.store.readInstalled()).toEqual([originalInstall])
    } finally {
      await sandbox.cleanup()
    }
  })
})
