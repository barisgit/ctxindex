import { expect, spyOn, test } from 'bun:test'
import type { CatalogRecord } from '@ctxindex/core/catalog'
import {
  type ExtensionCommandInput,
  handleExtensionsCommand,
} from './handle-extensions-command'
import type { ExtensionCommandServices } from './services'

const catalog = {
  name: 'fixture',
  repository: '/tmp/fixture.git',
  ref: 'refs/heads/main',
  commit: 'a'.repeat(40),
  snapshot_acquired_at: 1_000,
  catalog_id: 'fixture.catalog',
  catalog_label: 'Fixture Catalog',
  extensions: [],
} as unknown as CatalogRecord

// Catalog acquisition and inspection only touch Catalog files; they must not
// stop the daemon, take database ownership, or reload active definitions.
test('Catalog acquisition and inspection never enter active-provenance coordination', async () => {
  const forbidden = (name: string) => async () => {
    throw new Error(`Catalog command entered ${name}`)
  }
  const services = {
    catalogs: {
      add: async () => catalog,
      list: async () => [catalog],
      show: async () => catalog,
      refresh: async () => catalog,
      remove: async () => catalog,
      search: async () => [],
    },
    buildCatalogSnapshot: async () => ({
      changed: true,
      outputPath: '/tmp/ctxindex-catalog.json',
      manifest: {
        schemaVersion: 2,
        catalog: { id: 'fixture.catalog', label: 'Fixture Catalog' },
        extensions: [],
      },
    }),
    genericInstaller: {},
    coordinateMutation: forbidden('daemon mutation coordination'),
    loadDefinitions: forbidden('active definition loading'),
    readOAuthAppIdentities: forbidden('database-backed OAuth App reads'),
    readSourceBindings: forbidden('database-backed Source reads'),
  } as unknown as ExtensionCommandServices
  const commands: ExtensionCommandInput[] = [
    {
      kind: 'catalog-add',
      name: 'fixture',
      repository: '/tmp/fixture.git',
      ref: 'main',
      trust: true,
      json: true,
    },
    { kind: 'catalog-list', noRefresh: false, json: true },
    { kind: 'catalog-show', name: 'fixture', noRefresh: false, json: true },
    { kind: 'catalog-refresh', name: 'fixture', json: true },
    { kind: 'catalog-search', noRefresh: false, json: true },
    { kind: 'catalog-remove', name: 'fixture', json: true },
    {
      kind: 'catalog-build',
      packageRoot: '/tmp/package',
      trust: true,
      json: true,
    },
  ]
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    for (const command of commands) {
      expect(
        await handleExtensionsCommand(command, services),
        `${command.kind}: ${JSON.stringify(errors.mock.calls)}`,
      ).toBe(0)
    }
  } finally {
    output.mockRestore()
    errors.mockRestore()
  }
})
