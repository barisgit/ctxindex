import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { CollectedExtension } from '../registry/complete-registry'
import {
  collectExtensionExports,
  type ExtensionOriginProvenance,
} from './collector'
import {
  createExtensionHostDiagnostic,
  isExtensionHostDiagnostic,
} from './diagnostics'

export interface ResolvedPackageEntries {
  readonly entries: readonly string[]
  readonly provenance: ExtensionOriginProvenance
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

export async function importPackageEntries(
  resolved: ResolvedPackageEntries,
): Promise<CollectedExtension[]> {
  const collected: CollectedExtension[] = []
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
      collected.push(
        ...collectExtensionExports(module, entry, resolved.provenance),
      )
    } catch (cause) {
      if (isExtensionHostDiagnostic(cause)) throw cause
      throw createExtensionHostDiagnostic(
        'Extension exports could not be inspected',
      )
    }
  }
  return collected
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
