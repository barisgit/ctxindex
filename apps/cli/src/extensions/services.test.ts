import { expect, test } from 'bun:test'
import { join } from 'node:path'
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
      expect(options?.localOAuthAppIdentities).toEqual(identities)
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
  expect(services.genericInstaller.store.recordsPath).toBe(
    join('/tmp/ctxindex-cli-config', 'direct-extensions.json'),
  )

  const active = await services.genericInstaller.loadActiveState()
  expect(active.localOAuthAppIdentities).toEqual(identities)
  expect(identityReads).toBe(1)
  expect(definitionLoads).toBe(1)
})
