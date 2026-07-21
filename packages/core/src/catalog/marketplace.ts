import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { CatalogManifestEntry, CatalogRecord } from './schema'

export interface MarketplaceExtension {
  readonly id: string
  readonly summary?: string
  readonly catalogName: string
  readonly catalogId: string
  readonly catalogLabel: string
  readonly repository: string
  readonly commit: string
  readonly snapshotAcquiredAt: number
  readonly snapshotAgeMs: number
  readonly entryIndex: number
  readonly sourceKind: CatalogManifestEntry['source']['kind']
  readonly sourceLocator: MarketplaceSourceLocator
  readonly entry: CatalogManifestEntry
}

export type MarketplaceSourceLocator =
  | { readonly kind: 'package'; readonly entryIndex: number }
  | ({ readonly kind: 'literal' } & Extract<
      CatalogManifestEntry['source'],
      { readonly kind: 'literal' }
    >['locator'])

function sourceLocator(
  entry: CatalogManifestEntry,
  entryIndex: number,
): MarketplaceSourceLocator {
  if (entry.source.kind === 'package') return { kind: 'package', entryIndex }
  return { kind: 'literal', ...entry.source.locator }
}

function locatorKey(locator: MarketplaceSourceLocator): string {
  if (locator.kind === 'package') return `package:${locator.entryIndex}`
  return `literal:${locator.module}#${locator.catalogId}[${locator.entryIndex}]:${locator.extensionId}`
}

function compareMarketplace(
  left: MarketplaceExtension,
  right: MarketplaceExtension,
): number {
  return (
    compareUnicodeCodePoints(
      left.id.toLocaleLowerCase('en-US'),
      right.id.toLocaleLowerCase('en-US'),
    ) ||
    compareUnicodeCodePoints(left.catalogName, right.catalogName) ||
    compareUnicodeCodePoints(left.catalogId, right.catalogId) ||
    compareUnicodeCodePoints(
      locatorKey(left.sourceLocator),
      locatorKey(right.sourceLocator),
    )
  )
}

export function searchMarketplace(
  catalogs: readonly CatalogRecord[],
  query: string | undefined,
  now: number,
): readonly MarketplaceExtension[] {
  const normalizedQuery = query?.toLocaleLowerCase('en-US') ?? ''
  const results = catalogs.flatMap((catalog) =>
    catalog.extensions.flatMap((entry, entryIndex) => {
      const matches =
        normalizedQuery.length === 0 ||
        entry.id.toLocaleLowerCase('en-US').includes(normalizedQuery) ||
        entry.summary?.toLocaleLowerCase('en-US').includes(normalizedQuery) ===
          true
      if (!matches) return []
      return [
        {
          id: entry.id,
          ...(entry.summary === undefined ? {} : { summary: entry.summary }),
          catalogName: catalog.name,
          catalogId: catalog.catalog_id,
          catalogLabel: catalog.catalog_label,
          repository: catalog.repository,
          commit: catalog.commit,
          snapshotAcquiredAt: catalog.snapshot_acquired_at,
          snapshotAgeMs: Math.max(0, now - catalog.snapshot_acquired_at),
          entryIndex,
          sourceKind: entry.source.kind,
          sourceLocator: sourceLocator(entry, entryIndex),
          entry,
        },
      ]
    }),
  )
  return results.sort(compareMarketplace)
}
