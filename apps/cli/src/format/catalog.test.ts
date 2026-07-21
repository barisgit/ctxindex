import { expect, test } from 'bun:test'
import type { GenericExtensionInstallationRecord } from '@ctxindex/core'
import {
  type BuildCatalogSnapshotResult,
  type CatalogRecord,
  searchMarketplace,
} from '@ctxindex/core/catalog'
import {
  formatCatalog,
  formatCatalogBuild,
  formatCatalogExtension,
  formatInstalledExtension,
  formatMarketplace,
} from './catalog'

const digest = 'b'.repeat(64)
const catalog: CatalogRecord = {
  name: 'fixture',
  repository: '/tmp/fixture.git',
  ref: 'refs/heads/main',
  commit: 'a'.repeat(40),
  snapshot_acquired_at: 1_000,
  catalog_id: 'fixture.catalog',
  catalog_label: 'Fixture Catalog',
  generated: {
    packageName: '@fixture/catalog',
    packageVersion: '1.0.0',
  },
  extensions: [
    {
      id: 'fixture.extension',
      source: {
        kind: 'literal',
        authorPackage: {
          source: {
            kind: 'local',
            requestedTarget: '.',
            path: '.',
            contentDigest: digest,
          },
          packageRoot: '.',
          materializationDigest: digest,
          lock: {
            format: 'bun.lock@1.3.14',
            path: `ctxindex-resolutions/${digest}.json`,
            digest,
            byteLength: 10,
          },
        },
        locator: {
          module: 'index.ts',
          catalogId: 'fixture.catalog',
          entryIndex: 0,
          extensionId: 'fixture.extension',
        },
      },
    },
  ],
}

const installed: GenericExtensionInstallationRecord = {
  id: 'fixture.extension',
  source: {
    kind: 'npm',
    requested_target: '@fixture/extension@^2',
    package: '@fixture/extension',
    exact_version: '2.1.0',
    integrity: 'sha512-fixture',
  },
  dependency_resolution: { format: 'bun.lock@1.3.14', digest },
  materialization_digest: digest,
  package_root: 'node_modules/@fixture/extension',
  installed_at: 500,
  updated_at: 1_500,
  curation: {
    extension_id: 'fixture.extension',
    catalog_name: 'fixture',
    catalog_id: 'fixture.catalog',
    repository: '/tmp/fixture.git',
    commit: 'a'.repeat(40),
    snapshot_acquired_at: 1_000,
    source_locator: { kind: 'package', entryIndex: 0 },
    execution_materialization_digest: digest,
  },
}

test('Catalog output surfaces age and exact versionless locators', () => {
  expect(JSON.parse(formatCatalog(catalog, true, 4_000))).toMatchObject({
    snapshot_acquired_at: 1_000,
    snapshot_age_ms: 3_000,
  })
  expect(formatCatalog(catalog, false, 4_000)).toContain('Age: 3000ms')
  expect(formatCatalog(catalog, false, 4_000)).toContain(
    'literal index.ts#fixture.catalog[0]',
  )
  const extension = catalog.extensions[0]
  if (extension === undefined) throw new Error('missing Catalog fixture')
  expect(
    formatCatalogExtension(catalog, extension, false, 4_000),
  ).not.toContain('@1')
})

test('Catalog install output preserves generic execution and curation facts', () => {
  expect(
    JSON.parse(formatInstalledExtension('Installed', installed, true)),
  ).toMatchObject({
    action: 'installed',
    id: 'fixture.extension',
    installed_at: 500,
    updated_at: 1_500,
    curation: {
      catalog_name: 'fixture',
      source_locator: { kind: 'package', entryIndex: 0 },
    },
  })
  const human = formatInstalledExtension('Installed', installed, false)
  expect(human).toContain('Catalog: fixture')
  expect(human).toContain('Locator: package entry 0')
  expect(human).toContain('Resolved: 2.1.0 (sha512-fixture)')
})

test('Marketplace output includes deterministic Catalog age and exact source details', () => {
  const rows = searchMarketplace([catalog], undefined, 4_000)
  expect(JSON.parse(formatMarketplace(rows, true))).toMatchObject([
    {
      id: 'fixture.extension',
      catalogName: 'fixture',
      snapshotAgeMs: 3_000,
      sourceLocator: {
        kind: 'literal',
        module: 'index.ts',
        entryIndex: 0,
      },
    },
  ])
  const human = formatMarketplace(rows, false)
  expect(human).toContain('Catalog: fixture')
  expect(human).toContain('Age: 3000ms')
  expect(human).toContain('literal index.ts#fixture.catalog[0]')
  expect(human).toContain('local .')
})

test('Catalog build output reports destination, identity, count, and change status', () => {
  const result: BuildCatalogSnapshotResult = {
    changed: true,
    outputPath: '/tmp/catalog/ctxindex-catalog.json',
    manifest: {
      schemaVersion: 2,
      catalog: {
        id: catalog.catalog_id,
        label: catalog.catalog_label,
      },
      generated: catalog.generated,
      extensions: catalog.extensions,
    },
  }
  expect(JSON.parse(formatCatalogBuild(result, true))).toMatchObject({
    changed: true,
    outputPath: '/tmp/catalog/ctxindex-catalog.json',
    catalogId: 'fixture.catalog',
    extensionCount: 1,
  })
  expect(formatCatalogBuild(result, false)).toBe(
    'Built fixture.catalog\tExtensions: 1\tChanged: yes\tOutput: /tmp/catalog/ctxindex-catalog.json',
  )
})
