import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  DirectExtensionStore,
  directExtensionMaterializationPath,
  hashDirectory,
} from '@ctxindex/core'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import type { CliDefinitions } from '../definitions'
import { createExtensionCommandServices } from './services'

function definitions(): CliDefinitions {
  const registry = createExtensionRegistry([])
  return {
    roots: [],
    registry,
    completeRegistry: {
      extensions: new Map(),
      providers: new Map(),
      oauthApps: new Map(),
      profiles: new Map(),
      adapters: new Map(),
      provenances: new Map(),
    },
    diagnostics: [],
    provenance: [],
    documentation: { list: () => [], get: () => undefined },
    config: {
      extensions: { paths: [] },
      secrets: { backend: 'file' },
      log: {
        level: 'info',
        file: { rotate: 'daily', retain_days: 1, compress: false },
      },
    },
    description: { kinds: [], sources: [], actions: [] },
  }
}

test('shares generic state/materialization and reloads active validation state internally', async () => {
  const identities = [{ providerId: 'fixture', label: 'desktop' }]
  let identityReads = 0
  let definitionLoads = 0
  const services = createExtensionCommandServices({
    configRoot: '/tmp/ctxindex-cli-config',
    dataRoot: '/tmp/ctxindex-cli-data',
    readOAuthAppIdentities: async () => {
      identityReads += 1
      return identities
    },
    loadDefinitions: async (options) => {
      definitionLoads += 1
      expect(options).toMatchObject({
        configRoot: '/tmp/ctxindex-cli-config',
        dataRoot: '/tmp/ctxindex-cli-data',
        localOAuthAppIdentities: identities,
      })
      return definitions()
    },
    readSourceBindings: async () => [],
  })

  expect(services.direct.store).toBe(services.genericInstaller.store)
  expect(services.direct.materializer).toBe(
    services.genericInstaller.materializer,
  )
  expect(services.catalogs.installationRecords).toBe(
    services.genericInstaller.store,
  )
  expect(services.catalogInstallation.installer).toBe(services.genericInstaller)
  expect(services.lifecycle.records).toBe(services.genericInstaller.store)
  expect(services.lifecycle.installer).toBe(services.genericInstaller)
  expect(services.lifecycle.catalogInstallation).toBe(
    services.catalogInstallation,
  )
  expect(services.genericInstaller.store.recordsPath).toBe(
    join('/tmp/ctxindex-cli-config', 'direct-extensions.json'),
  )

  const active = await services.genericInstaller.loadActiveState()
  expect(active.localOAuthAppIdentities).toEqual(identities)
  expect(identityReads).toBe(1)
  expect(definitionLoads).toBe(1)
})

test('active validation loads installed Extensions from injected roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-cli-roots-'))
  const configRoot = join(root, 'config')
  const dataRoot = join(root, 'data')
  const staging = join(root, 'materialization')
  try {
    const packageRoot = join(staging, 'package')
    await mkdir(packageRoot, { recursive: true })
    await writeFile(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@fixture/injected-roots',
        type: 'module',
        ctxindex: { extensions: ['./extension.js'] },
      }),
    )
    await writeFile(
      join(packageRoot, 'extension.js'),
      `export default { kind: 'extension', id: 'fixture.injected-roots', adapters: [], oauthApps: [], providers: [], profiles: [] }\n`,
    )
    const digest = await hashDirectory(staging)
    const materialization = directExtensionMaterializationPath(dataRoot, digest)
    await mkdir(dirname(materialization), { recursive: true })
    await rename(staging, materialization)
    await new DirectExtensionStore({ configRoot, dataRoot }).writeRecords([
      {
        id: 'fixture.injected-roots',
        source: {
          kind: 'local',
          requested_target: 'fixture/injected-roots',
          content_digest: 'a'.repeat(64),
        },
        dependency_resolution: {
          format: 'bun.lock@1.3.14',
          digest: 'b'.repeat(64),
        },
        materialization_digest: digest,
        package_root: 'package',
        installed_at: 1,
        updated_at: 1,
      },
    ])

    const services = createExtensionCommandServices({
      configRoot,
      dataRoot,
      readOAuthAppIdentities: async () => [],
      readSourceBindings: async () => [],
    })
    const active = await services.genericInstaller.loadActiveState()

    expect(active.roots?.map(({ definition }) => definition.id)).toContain(
      'fixture.injected-roots',
    )
    expect(active.registry.list().map(({ id }) => id)).toContain(
      'fixture.injected-roots',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
