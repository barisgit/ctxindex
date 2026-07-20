import type { AnyExtensionDefinition } from '@ctxindex/extension-sdk'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type {
  CollectedExtension,
  DefinitionProvenance,
} from '../registry/complete-registry'
import { createExtensionHostDiagnostic } from './diagnostics'

export type DefinitionModule = Readonly<Record<string, unknown>>

export type ExtensionOriginProvenance = Omit<
  DefinitionProvenance,
  'entry' | 'exportName'
>

function isClaimedExtension(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'extension'
  )
}

function isExtension(value: Record<string, unknown>): boolean {
  const allowed = new Set([
    'kind',
    'id',
    'providers',
    'oauthApps',
    'profiles',
    'adapters',
  ])
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    Array.isArray(value.providers) &&
    Array.isArray(value.oauthApps) &&
    Array.isArray(value.profiles) &&
    Array.isArray(value.adapters)
  )
}

export function collectExtensionExports(
  module: DefinitionModule,
  entry: string,
  provenance: ExtensionOriginProvenance,
): CollectedExtension[] {
  const collected: CollectedExtension[] = []
  for (const [exportName, value] of Object.entries(module).sort(
    ([left], [right]) => compareUnicodeCodePoints(left, right),
  )) {
    if (!isClaimedExtension(value)) continue
    if (!isExtension(value)) {
      throw createExtensionHostDiagnostic('Invalid Extension export')
    }
    const definition = value as unknown as AnyExtensionDefinition
    collected.push({
      definition,
      provenance: {
        ...provenance,
        entry,
        exportName,
      },
    })
  }
  return collected
}
