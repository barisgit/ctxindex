import type {
  CatalogRecord,
  InstalledExtensionRecord,
} from '@ctxindex/core/catalog'

export function formatCatalogs(
  catalogs: readonly CatalogRecord[],
  json: boolean,
): string {
  if (json) return JSON.stringify(catalogs, null, 2)
  return catalogs
    .map(
      (catalog) =>
        `${catalog.name}\t${catalog.catalog_id}\t${catalog.commit}\t${catalog.repository}\t${catalog.ref}`,
    )
    .join('\n')
}

export function formatCatalog(catalog: CatalogRecord, json: boolean): string {
  if (json) return JSON.stringify(catalog, null, 2)
  const header = `${catalog.name}\t${catalog.catalog_id}\t${catalog.commit}\t${catalog.repository}\t${catalog.ref}`
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
): string {
  const value = {
    catalog: catalog.name,
    catalog_id: catalog.catalog_id,
    repository: catalog.repository,
    ref: catalog.ref,
    commit: catalog.commit,
    extension,
  }
  if (json) return JSON.stringify(value, null, 2)
  return `${extension.id}@${extension.version}\tCatalog: ${catalog.name}\tCommit: ${catalog.commit}\tSource: ${extension.source_path}${extension.setup_path === undefined ? '' : `\tSetup: ${extension.setup_path}`}`
}

export function formatInstalledExtension(
  action: 'Installed' | 'Uninstalled',
  extension: InstalledExtensionRecord,
  json: boolean,
): string {
  if (json)
    return JSON.stringify(
      { action: action.toLowerCase(), ...extension },
      null,
      2,
    )
  return `${action} ${extension.id}@${extension.version}\tCatalog: ${extension.catalog_name}\tCommit: ${extension.commit}\tRepository: ${extension.repository}\tSource: ${extension.source_path}`
}
