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
  return `${verb} ${extension.id}\tSource: ${extension.sourceKind} ${extension.requestedTarget}\tResolved: ${extension.resolvedIdentity}\tMaterialization: ${extension.materializationDigest}`
}

export function formatDirectExtensionUninstall(
  result: DirectExtensionUninstallResult,
  json: boolean,
): string {
  if (json) return JSON.stringify(result, null, 2)
  const preserved =
    result.blockingSources.length === 0
      ? ''
      : `\tPreserved unavailable Sources: ${result.blockingSources.map(({ label }) => label).join(', ')}`
  return `Uninstalled ${result.extension.id}${preserved}`
}
