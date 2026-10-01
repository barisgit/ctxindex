import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AnyCatalogDefinition,
  AnyExtensionDefinition,
  PackageExtensionDescriptor,
} from '@ctxindex/extension-sdk'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import type { CollectedExtension } from '../registry/complete-registry'
import {
  collectExtensionExports,
  type ExtensionOriginProvenance,
} from './collector'
import {
  createExtensionHostDiagnostic,
  isExtensionHostDiagnostic,
} from './diagnostics'
import { resolveCollectedExtensionDocumentation } from './documentation'

export interface ResolvedPackageEntries {
  readonly entries: readonly string[]
  readonly provenance: ExtensionOriginProvenance
}

interface CollectedPackageRoot {
  readonly root: CollectedExtension
  readonly definitionModuleUrl: URL
}

export type InspectedPackageRoot =
  | {
      readonly definition: AnyExtensionDefinition
      readonly modulePath: string
    }
  | {
      readonly definition: AnyCatalogDefinition
      readonly modulePath: string
    }

export interface InspectedCatalogRoot {
  readonly definition: AnyCatalogDefinition
  readonly modulePath: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.getPrototypeOf(value) === Object.prototype
}

const DEFINITION_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value)
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  )
}

function isStableId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    DEFINITION_ID_PATTERN.test(value)
  )
}

function isExtensionDefinition(
  value: unknown,
): value is AnyExtensionDefinition {
  if (!isRecord(value) || value.kind !== 'extension') return false
  const allowed = new Set([
    'kind',
    'id',
    'providers',
    'oauthApps',
    'profiles',
    'adapters',
    'docs',
  ])
  return (
    Object.keys(value).every((key) => allowed.has(key)) &&
    isStableId(value.id) &&
    Array.isArray(value.providers) &&
    Array.isArray(value.oauthApps) &&
    Array.isArray(value.profiles) &&
    Array.isArray(value.adapters)
  )
}

function isPackageDescriptor(
  value: unknown,
): value is PackageExtensionDescriptor {
  if (
    !isRecord(value) ||
    value.kind !== 'package-extension' ||
    !hasExactKeys(value, ['kind', 'source', 'extensionId']) ||
    !isStableId(value.extensionId) ||
    !isRecord(value.source) ||
    !hasExactKeys(value.source, ['kind', 'target'])
  ) {
    return false
  }
  return (
    (value.source.kind === 'npm' ||
      value.source.kind === 'git' ||
      value.source.kind === 'local') &&
    typeof value.source.target === 'string' &&
    value.source.target.length > 0 &&
    value.source.target.trim() === value.source.target &&
    !value.source.target.includes('\0')
  )
}

function parseCatalogDefinition(value: unknown): AnyCatalogDefinition {
  if (
    !isRecord(value) ||
    value.kind !== 'catalog' ||
    !Object.keys(value).every((key) =>
      [
        'kind',
        'id',
        'label',
        'summary',
        'entrySummaries',
        'extensions',
      ].includes(key),
    ) ||
    !isStableId(value.id) ||
    typeof value.label !== 'string' ||
    value.label.length === 0 ||
    (value.summary !== undefined && typeof value.summary !== 'string') ||
    !Array.isArray(value.extensions) ||
    value.extensions.length > 256
  ) {
    throw createExtensionHostDiagnostic('Invalid Catalog export')
  }
  const ids = new Set<string>()
  for (const entry of value.extensions) {
    const id = isExtensionDefinition(entry)
      ? entry.id
      : isPackageDescriptor(entry)
        ? entry.extensionId
        : undefined
    if (id === undefined)
      throw createExtensionHostDiagnostic('Invalid Catalog export')
    if (ids.has(id))
      throw createExtensionHostDiagnostic(
        `Duplicate Catalog Extension id ${id}`,
      )
    ids.add(id)
  }
  if (value.entrySummaries !== undefined) {
    if (!isPlainRecord(value.entrySummaries)) {
      throw createExtensionHostDiagnostic('Invalid Catalog export')
    }
    for (const [id, summary] of Object.entries(value.entrySummaries)) {
      if (!ids.has(id) || typeof summary !== 'string' || summary.length === 0) {
        throw createExtensionHostDiagnostic('Invalid Catalog export')
      }
    }
  }
  return value as unknown as AnyCatalogDefinition
}

function manifestEntries(manifest: unknown): readonly string[] {
  if (!isRecord(manifest) || !isRecord(manifest.ctxindex))
    throw createExtensionHostDiagnostic(
      'package.json must declare ctxindex.extensions',
    )
  const entries = manifest.ctxindex.extensions
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    !entries.every((entry) => typeof entry === 'string' && entry.length > 0)
  ) {
    throw createExtensionHostDiagnostic(
      'package.json ctxindex.extensions must be module paths',
    )
  }
  return entries
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate)
  return (
    fromRoot !== '..' &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  )
}

export async function resolvePackageEntries(
  packageRoot: string,
  manifest: unknown,
  provenance: ExtensionOriginProvenance,
): Promise<ResolvedPackageEntries> {
  const root = await realpath(packageRoot)
  if (!(await stat(root)).isDirectory())
    throw createExtensionHostDiagnostic(
      'Extension package root must be a directory',
    )
  const resolved: string[] = []
  const seen = new Set<string>()
  for (const entry of manifestEntries(manifest)) {
    if (
      isAbsolute(entry) ||
      entry.includes('\0') ||
      entry.includes('\\') ||
      entry.includes('#') ||
      entry.includes('?')
    )
      throw createExtensionHostDiagnostic(
        'Extension package entry must be contained',
      )
    const unresolved = resolve(root, entry)
    if (!isContained(root, unresolved))
      throw createExtensionHostDiagnostic(
        'Extension package entry escapes package root',
      )
    const candidate = await realpath(unresolved)
    if (!isContained(root, candidate))
      throw createExtensionHostDiagnostic(
        'Extension package entry escapes package root',
      )
    if (!(await stat(candidate)).isFile())
      throw createExtensionHostDiagnostic(
        'Extension package entry is not a file',
      )
    if (seen.has(candidate))
      throw createExtensionHostDiagnostic('Duplicate Extension package entry')
    seen.add(candidate)
    resolved.push(candidate)
  }
  return { entries: resolved, provenance }
}

async function collectPackageEntries(
  resolved: ResolvedPackageEntries,
): Promise<CollectedPackageRoot[]> {
  const collected: CollectedPackageRoot[] = []
  for (const entry of resolved.entries) {
    let module: Readonly<Record<string, unknown>>
    try {
      module = (await import(pathToFileURL(entry).href)) as Readonly<
        Record<string, unknown>
      >
    } catch {
      throw createExtensionHostDiagnostic(
        'Extension entry could not be evaluated',
      )
    }
    try {
      const roots = collectExtensionExports(module, entry, resolved.provenance)
      const definitionModuleUrl = pathToFileURL(entry)
      collected.push(...roots.map((root) => ({ root, definitionModuleUrl })))
    } catch (cause) {
      if (isExtensionHostDiagnostic(cause)) throw cause
      throw createExtensionHostDiagnostic(
        'Extension exports could not be inspected',
      )
    }
  }
  return collected
}

export async function inspectPackageEntries(
  resolved: ResolvedPackageEntries,
): Promise<InspectedPackageRoot[]> {
  const inspected: InspectedPackageRoot[] = []
  const identities = new Set<string>()
  for (const modulePath of resolved.entries) {
    let module: Readonly<Record<string, unknown>>
    try {
      module = (await import(pathToFileURL(modulePath).href)) as Readonly<
        Record<string, unknown>
      >
    } catch {
      throw createExtensionHostDiagnostic(
        'Extension entry could not be evaluated',
      )
    }
    for (const [exportName, value] of Object.entries(module).sort(
      ([left], [right]) => compareUnicodeCodePoints(left, right),
    )) {
      if (
        !isRecord(value) ||
        (value.kind !== 'extension' && value.kind !== 'catalog')
      )
        continue
      if (value.kind === 'extension') {
        let collected: CollectedExtension
        try {
          const roots = collectExtensionExports(
            { [exportName]: value },
            modulePath,
            resolved.provenance,
          )
          collected = roots[0] as CollectedExtension
        } catch {
          throw createExtensionHostDiagnostic('Invalid Extension export')
        }
        const identity = `extension:${collected.definition.id}`
        if (identities.has(identity))
          throw createExtensionHostDiagnostic(
            `Duplicate Extension export ${collected.definition.id}`,
          )
        identities.add(identity)
        inspected.push({
          definition: collected.definition,
          modulePath,
        })
        continue
      }
      const definition = parseCatalogDefinition(value)
      const identity = `catalog:${definition.id}`
      if (identities.has(identity))
        throw createExtensionHostDiagnostic(
          `Duplicate Catalog export ${definition.id}`,
        )
      identities.add(identity)
      inspected.push({ definition, modulePath })
    }
  }
  return inspected
}

export function selectExactCatalog(
  inspected: readonly InspectedPackageRoot[],
  id: string,
): InspectedCatalogRoot {
  const matches = inspected.filter(
    (root): root is InspectedCatalogRoot =>
      root.definition.kind === 'catalog' && root.definition.id === id,
  )
  if (matches.length === 0)
    throw createExtensionHostDiagnostic('Requested Catalog was not exported')
  if (matches.length > 1)
    throw createExtensionHostDiagnostic(
      'Requested Catalog is ambiguous across exports',
    )
  return matches[0] as InspectedCatalogRoot
}

export function selectCatalogLiteral(
  catalog: AnyCatalogDefinition,
  entryIndex: number,
  extensionId: string,
): AnyExtensionDefinition {
  if (!Number.isSafeInteger(entryIndex) || entryIndex < 0)
    throw createExtensionHostDiagnostic('Invalid Catalog entry index')
  const entry = catalog.extensions[entryIndex]
  if (entry === undefined || entry.kind !== 'extension')
    throw createExtensionHostDiagnostic(
      'Catalog entry index does not identify a literal Extension',
    )
  if (entry.id !== extensionId)
    throw createExtensionHostDiagnostic('Catalog literal identity mismatch')
  return entry
}

async function resolvePackageRoot(
  candidate: CollectedPackageRoot,
): Promise<CollectedExtension> {
  try {
    return await resolveCollectedExtensionDocumentation(
      candidate.root,
      candidate.definitionModuleUrl,
    )
  } catch (cause) {
    if (isExtensionHostDiagnostic(cause)) throw cause
    throw createExtensionHostDiagnostic(
      'Extension exports could not be inspected',
    )
  }
}

export async function importPackageEntries(
  resolved: ResolvedPackageEntries,
): Promise<CollectedExtension[]> {
  const candidates = await collectPackageEntries(resolved)
  const collected: CollectedExtension[] = []
  for (const candidate of candidates)
    collected.push(await resolvePackageRoot(candidate))
  return collected
}

export async function importSelectedPackageEntry(
  resolved: ResolvedPackageEntries,
  id: string,
): Promise<CollectedExtension> {
  const candidates = await collectPackageEntries(resolved)
  const selected = selectExactExtension(
    candidates.map(({ root }) => root),
    id,
  )
  const candidate = candidates.find(({ root }) => root === selected)
  if (candidate === undefined)
    throw createExtensionHostDiagnostic('Requested Extension was not exported')
  return resolvePackageRoot(candidate)
}

export function selectExactExtension(
  collected: readonly CollectedExtension[],
  id: string,
): CollectedExtension {
  const matches = collected.filter(({ definition }) => definition.id === id)
  if (matches.length === 0)
    throw createExtensionHostDiagnostic('Requested Extension was not exported')
  if (matches.length > 1) {
    throw createExtensionHostDiagnostic(
      'Requested Extension is ambiguous across exports',
    )
  }
  return matches[0] as CollectedExtension
}
