import { describe, expect, test } from 'bun:test'
import { searchMarketplace } from './marketplace'
import type { CatalogRecord } from './schema'

const replay = {
  source: {
    kind: 'npm' as const,
    requestedTarget: '@example/mail@^1',
    package: '@example/mail',
    version: '1.2.3',
    integrity: 'sha512-fixture',
  },
  packageRoot: 'node_modules/@example/mail',
  materializationDigest: 'b'.repeat(64),
  lock: {
    format: 'bun.lock@1.3.14' as const,
    path: 'resolutions/fixture.lock',
    digest: 'c'.repeat(64),
    byteLength: 10,
  },
}

function catalog(name: string, catalogId: string): CatalogRecord {
  return {
    name,
    repository: `/tmp/${name}.git`,
    ref: 'refs/heads/main',
    commit: 'a'.repeat(40),
    snapshot_acquired_at: 1_000,
    catalog_id: catalogId,
    catalog_label: `${name} label`,
    generated: { packageName: `@example/${name}`, packageVersion: '1.0.0' },
    extensions: [
      {
        id: 'shared.mail',
        summary: `${name} EMAIL client`,
        source: { kind: 'package', replay },
      },
    ],
  }
}

describe('Marketplace projection', () => {
  test('retains duplicate curation rows, matches case-insensitively, and reports age', () => {
    const results = searchMarketplace(
      [catalog('zeta', 'zeta.catalog'), catalog('alpha', 'alpha.catalog')],
      'email',
      1_600,
    )

    expect(results.map(({ catalogName }) => catalogName)).toEqual([
      'alpha',
      'zeta',
    ])
    expect(results.map(({ id }) => id)).toEqual(['shared.mail', 'shared.mail'])
    expect(results.map(({ snapshotAgeMs }) => snapshotAgeMs)).toEqual([
      600, 600,
    ])
    expect(results[0]).toMatchObject({
      catalogId: 'alpha.catalog',
      entryIndex: 0,
      sourceKind: 'package',
      sourceLocator: { kind: 'package', entryIndex: 0 },
    })
  })
})
