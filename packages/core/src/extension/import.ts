import { readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { AnyExtensionDefinition } from '@ctxindex/extension-sdk'
import type { CollectedExtension } from '../registry/complete-registry'
import type { ExtensionOriginProvenance } from './collector'
import { createExtensionHostDiagnostic } from './diagnostics'
import {
  importPackageEntries,
  resolvePackageEntries,
  selectExactExtension,
} from './package-entry'

function packageIdentity(manifest: unknown): {
  readonly packageName?: string
  readonly packageVersion?: string
} {
  if (manifest === null || typeof manifest !== 'object') return {}
  const record = manifest as Record<string, unknown>
  return {
    ...(typeof record.name === 'string' ? { packageName: record.name } : {}),
    ...(typeof record.version === 'string'
      ? { packageVersion: record.version }
      : {}),
  }
}

export async function importExtensionPackageRoots(
  packageRoot: string,
  provenance: ExtensionOriginProvenance = { origin: 'explicit-path' },
): Promise<CollectedExtension[]> {
  let root: string
  let manifest: unknown
  try {
    root = await realpath(packageRoot)
    manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  } catch {
    throw createExtensionHostDiagnostic(
      'Extension package manifest could not be read',
    )
  }
  const resolved = await resolvePackageEntries(root, manifest, {
    ...packageIdentity(manifest),
    ...provenance,
  })
  return importPackageEntries(resolved)
}

export async function importExtensionRoots(
  packageRoot: string,
  provenance: ExtensionOriginProvenance = { origin: 'explicit-path' },
): Promise<CollectedExtension[]> {
  return importExtensionPackageRoots(packageRoot, provenance)
}

export async function importExtensionDefinition(
  packageRoot: string,
  extensionId?: string,
): Promise<AnyExtensionDefinition> {
  const collected = await importExtensionRoots(packageRoot)
  if (extensionId !== undefined)
    return selectExactExtension(collected, extensionId).definition
  if (collected.length === 0)
    throw createExtensionHostDiagnostic(
      'Entry exports no supported Extension root',
    )
  if (collected.length > 1)
    throw createExtensionHostDiagnostic(
      'Entry exports multiple Extensions; select one exact Extension id',
    )
  return (collected[0] as CollectedExtension).definition
}
