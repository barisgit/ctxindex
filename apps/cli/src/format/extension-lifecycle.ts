import type { GenericExtensionInstallationRecord } from '@ctxindex/core'

function resolvedIdentity(record: GenericExtensionInstallationRecord): string {
  if (record.source.kind === 'npm')
    return `${record.source.exact_version}${record.source.integrity === undefined ? '' : ` (${record.source.integrity})`}`
  if (record.source.kind === 'git') return record.source.commit
  return record.source.content_digest
}

function locatorDescription(
  locator: NonNullable<
    GenericExtensionInstallationRecord['curation']
  >['source_locator'],
): string {
  if (locator.kind === 'package') return `package entry ${locator.entryIndex}`
  return `literal ${locator.module}#${locator.catalogId}[${locator.entryIndex}]:${locator.extensionId}`
}

export function formatExtensionLifecycle(
  action: 'Installed' | 'Updated',
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
  return `${action} ${extension.id}\tCatalog: ${curation?.catalog_name ?? 'none'}\tCommit: ${curation?.commit ?? 'none'}\tLocator: ${curation === undefined ? 'none' : locatorDescription(curation.source_locator)}\tSource: ${extension.source.kind} ${extension.source.requested_target}\tResolved: ${resolvedIdentity(extension)}\tMaterialization: ${extension.materialization_digest}\tInstalled: ${extension.installed_at}\tUpdated: ${extension.updated_at}`
}
