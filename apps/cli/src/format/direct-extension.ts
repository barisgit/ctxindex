import type {
  DirectExtensionInventoryEntry,
  DirectExtensionUninstallResult,
} from '@ctxindex/core'

export function formatDirectExtension(
  verb: 'Installed' | 'Updated',
  extension: DirectExtensionInventoryEntry,
  json: boolean,
): string {
  if (json) return JSON.stringify(extension, null, 2)
  return `${verb} ${extension.id}\tSource: ${extension.sourceKind} ${extension.requestedTarget}\tResolved: ${extension.resolvedIdentity}\tMaterialization: ${extension.materializationDigest}\tInstalled: ${extension.installedAt}\tUpdated: ${extension.updatedAt}`
}

export function formatDirectExtensionUninstall(
  result: DirectExtensionUninstallResult,
  json: boolean,
): string {
  if (json) return JSON.stringify(result, null, 2)
  const affected =
    result.blockingSources.length === 0
      ? ''
      : `\tAffected Sources unavailable: ${result.blockingSources.map(({ label }) => label).join(', ')}`
  const preserved = result.forced
    ? '\tSources and materialized data preserved'
    : ''
  return `Uninstalled ${result.extension.id}${preserved}${affected}`
}
