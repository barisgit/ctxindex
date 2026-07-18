import type {
  CatalogRecord,
  InstalledExtensionRecord,
} from '@ctxindex/core/catalog'

function withSnapshotAge<T extends { readonly snapshot_acquired_at: number }>(
  value: T,
  now: number,
): T & { readonly snapshot_age_ms: number } {
  return {
    ...value,
    snapshot_age_ms: Math.max(0, now - value.snapshot_acquired_at),
  }
}

export function formatCatalogs(
  catalogs: readonly CatalogRecord[],
  json: boolean,
  now = Date.now(),
): string {
  if (json)
    return JSON.stringify(
      catalogs.map((catalog) => withSnapshotAge(catalog, now)),
      null,
      2,
    )
  return catalogs
    .map(
      (catalog) =>
        `${catalog.name}\t${catalog.catalog_id}\t${catalog.commit}\t${catalog.repository}\t${catalog.ref}\tAge: ${Math.max(0, now - catalog.snapshot_acquired_at)}ms`,
    )
    .join('\n')
}

export function formatCatalog(
  catalog: CatalogRecord,
  json: boolean,
  now = Date.now(),
): string {
  if (json) return JSON.stringify(withSnapshotAge(catalog, now), null, 2)
  const header = `${catalog.name}\t${catalog.catalog_id}\t${catalog.commit}\t${catalog.repository}\t${catalog.ref}\tAge: ${Math.max(0, now - catalog.snapshot_acquired_at)}ms`
  const entries = catalog.extensions.map(
    (entry) =>
      `${entry.id}@${entry.version}\tSource: ${entry.source_path}${entry.setup_path === undefined ? '' : `\tSetup: ${entry.setup_path}`}`,
  )
  return [header, ...entries].join('\n')
}

export function formatCatalogExtension(
  catalog: CatalogRecord,
  extension: CatalogRecord['extensions'][number],
  json: boolean,
  now = Date.now(),
): string {
  const value = {
    catalog: catalog.name,
    catalog_id: catalog.catalog_id,
    repository: catalog.repository,
    ref: catalog.ref,
    commit: catalog.commit,
    snapshot_acquired_at: catalog.snapshot_acquired_at,
    snapshot_age_ms: Math.max(0, now - catalog.snapshot_acquired_at),
    extension,
  }
  if (json) return JSON.stringify(value, null, 2)
  return `${extension.id}@${extension.version}\tCatalog: ${catalog.name}\tCommit: ${catalog.commit}\tAge: ${Math.max(0, now - catalog.snapshot_acquired_at)}ms\tSource: ${extension.source_path}${extension.setup_path === undefined ? '' : `\tSetup: ${extension.setup_path}`}`
}

export function formatInstalledExtension(
  action: 'Installed' | 'Uninstalled',
  extension: InstalledExtensionRecord,
  json: boolean,
  now = Date.now(),
): string {
  if (json)
    return JSON.stringify(
      {
        action: action.toLowerCase(),
        ...withSnapshotAge(extension, now),
      },
      null,
      2,
    )
  return `${action} ${extension.id}@${extension.version}\tCatalog: ${extension.catalog_name}\tCommit: ${extension.commit}\tAge: ${Math.max(0, now - extension.snapshot_acquired_at)}ms\tRepository: ${extension.repository}\tSource: ${extension.source_path}`
}
