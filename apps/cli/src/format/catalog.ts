import type {
  CatalogSourceLocator,
  GenericExtensionInstallationRecord,
} from '@ctxindex/core'
import type {
  BuildCatalogSnapshotResult,
  CatalogManifestEntry,
  CatalogRecord,
  CatalogReplayPayload,
  MarketplaceExtension,
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

function replayDescription(replay: CatalogReplayPayload): string {
  const source = replay.source
  if (source.kind === 'npm')
    return `npm ${source.requestedTarget} -> ${source.version} (${source.integrity})`
  if (source.kind === 'git')
    return `git ${source.requestedTarget} -> ${source.commit}`
  return `local ${source.path} (${source.contentDigest})`
}

function entrySourceDescription(entry: CatalogManifestEntry): string {
  if (entry.source.kind === 'package')
    return replayDescription(entry.source.replay)
  const { locator } = entry.source
  return `literal ${locator.module}#${locator.catalogId}[${locator.entryIndex}] via ${replayDescription(entry.source.authorPackage)}`
}

function locatorDescription(locator: CatalogSourceLocator): string {
  if (locator.kind === 'package') return `package entry ${locator.entryIndex}`
  return `literal ${locator.module}#${locator.catalogId}[${locator.entryIndex}]:${locator.extensionId}`
}

function installedResolvedIdentity(
  record: GenericExtensionInstallationRecord,
): string {
  if (record.source.kind === 'npm')
    return `${record.source.exact_version}${record.source.integrity === undefined ? '' : ` (${record.source.integrity})`}`
  if (record.source.kind === 'git') return record.source.commit
  return record.source.content_digest
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
    (entry) => `${entry.id}\tSource: ${entrySourceDescription(entry)}`,
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
  return `${extension.id}\tCatalog: ${catalog.name}\tCommit: ${catalog.commit}\tAge: ${Math.max(0, now - catalog.snapshot_acquired_at)}ms\tSource: ${entrySourceDescription(extension)}`
}

export function formatMarketplace(
  extensions: readonly MarketplaceExtension[],
  json: boolean,
): string {
  if (json) return JSON.stringify(extensions, null, 2)
  return extensions
    .map(
      (extension) =>
        `${extension.id}\tCatalog: ${extension.catalogName}\tCommit: ${extension.commit}\tAge: ${extension.snapshotAgeMs}ms\tLocator: ${locatorDescription(extension.sourceLocator)}\tSource: ${entrySourceDescription(extension.entry)}`,
    )
    .join('\n')
}

export function formatCatalogBuild(
  result: BuildCatalogSnapshotResult,
  json: boolean,
): string {
  const value = {
    changed: result.changed,
    outputPath: result.outputPath,
    catalogId: result.manifest.catalog.id,
    extensionCount: result.manifest.extensions.length,
  }
  if (json) return JSON.stringify(value, null, 2)
  return `Built ${value.catalogId}\tExtensions: ${value.extensionCount}\tChanged: ${value.changed ? 'yes' : 'no'}\tOutput: ${value.outputPath}`
}

export function formatInstalledExtension(
  action: 'Installed' | 'Updated' | 'Uninstalled',
  extension: GenericExtensionInstallationRecord,
  json: boolean,
): string {
  if (json)
    return JSON.stringify(
      { action: action.toLowerCase(), ...extension },
      null,
      2,
    )
  const curation = extension.curation
  return `${action} ${extension.id}\tCatalog: ${curation?.catalog_name ?? 'none'}\tCommit: ${curation?.commit ?? 'none'}\tLocator: ${curation === undefined ? 'none' : locatorDescription(curation.source_locator)}\tSource: ${extension.source.kind} ${extension.source.requested_target}\tResolved: ${installedResolvedIdentity(extension)}\tInstalled: ${extension.installed_at}\tUpdated: ${extension.updated_at}`
}
