import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  CATALOG_MANIFEST_MAX_BYTES,
  CATALOG_SETUP_MAX_BYTES,
  type CatalogManifest,
  parseCatalogManifest,
  validateCatalogName,
  validateCatalogRelativePath,
} from './schema'

export function validateCatalogCommit(commit: string): string {
  if (!/^[0-9a-f]{40,64}$/.test(commit)) {
    throw new TypeError('Catalog commit must be an exact lowercase object ID')
  }
  return commit
}

export function catalogSnapshotPath(
  dataRoot: string,
  catalogName: string,
  commit: string,
): string {
  return join(
    dataRoot,
    'catalogs',
    validateCatalogName(catalogName),
    validateCatalogCommit(commit),
  )
}

function isInside(root: string, target: string): boolean {
  const fromRoot = relative(root, target)
  return (
    fromRoot === '' ||
    (!fromRoot.startsWith(`..${sep}`) &&
      fromRoot !== '..' &&
      !isAbsolute(fromRoot))
  )
}

async function validateSnapshotPath(
  snapshotRoot: string,
  relativePath: string,
  kind: 'source' | 'setup',
): Promise<void> {
  const path = validateCatalogRelativePath(relativePath)
  const canonicalRoot = await realpath(snapshotRoot)
  let canonicalTarget: string
  try {
    canonicalTarget = await realpath(resolve(snapshotRoot, path))
  } catch (cause) {
    throw new TypeError(`Catalog ${kind} path does not exist: ${path}`, {
      cause,
    })
  }
  if (!isInside(canonicalRoot, canonicalTarget)) {
    throw new TypeError(`Catalog ${kind} path escapes snapshot: ${path}`)
  }
  const info = await stat(canonicalTarget)
  if (kind === 'source' && !info.isDirectory()) {
    throw new TypeError(`Catalog source path is not a package root: ${path}`)
  }
  if (kind === 'setup' && !info.isFile()) {
    throw new TypeError(`Catalog setup path is not a regular file: ${path}`)
  }
  if (kind === 'setup' && info.size > CATALOG_SETUP_MAX_BYTES) {
    throw new TypeError(`Catalog setup file exceeds 1 MiB: ${path}`)
  }
}

export async function validateCatalogSnapshot(
  snapshotRoot: string,
): Promise<CatalogManifest> {
  const manifestPath = join(snapshotRoot, 'ctxindex-catalog.json')
  let canonicalManifest: string
  try {
    canonicalManifest = await realpath(manifestPath)
  } catch {
    throw new TypeError('Catalog snapshot is missing ctxindex-catalog.json')
  }
  const canonicalRoot = await realpath(snapshotRoot)
  if (!isInside(canonicalRoot, canonicalManifest)) {
    throw new TypeError('Catalog manifest escapes snapshot')
  }
  const manifestInfo = await stat(canonicalManifest)
  if (!manifestInfo.isFile()) {
    throw new TypeError('Catalog manifest is not a regular file')
  }
  if (manifestInfo.size > CATALOG_MANIFEST_MAX_BYTES) {
    throw new TypeError('Catalog manifest exceeds 256 KiB')
  }
  let manifestText: string
  try {
    manifestText = new TextDecoder('utf-8', { fatal: true }).decode(
      await Bun.file(canonicalManifest).arrayBuffer(),
    )
  } catch (cause) {
    throw new TypeError('Catalog manifest is not valid UTF-8', { cause })
  }
  const manifest = parseCatalogManifest(manifestText)
  for (const entry of manifest.extensions) {
    await validateSnapshotPath(snapshotRoot, entry.source.path, 'source')
    if (entry.setup !== undefined) {
      await validateSnapshotPath(snapshotRoot, entry.setup.path, 'setup')
    }
  }
  return manifest
}
