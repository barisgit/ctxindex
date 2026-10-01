import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  CATALOG_MANIFEST_MAX_BYTES,
  type CatalogManifest,
  type CatalogReplayPayload,
  parseCatalogManifest,
  validateCatalogName,
  validateCatalogPackagePath,
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

async function validateContainedPath(input: {
  readonly snapshotRoot: string
  readonly relativePath: string
  readonly kind: 'module' | 'package' | 'resolution artifact'
}): Promise<string> {
  const path =
    input.kind === 'package'
      ? validateCatalogPackagePath(input.relativePath)
      : validateCatalogRelativePath(input.relativePath)
  const canonicalRoot = await realpath(input.snapshotRoot)
  let canonicalTarget: string
  try {
    canonicalTarget = await realpath(resolve(input.snapshotRoot, path))
  } catch (cause) {
    throw new TypeError(`Catalog ${input.kind} path does not exist: ${path}`, {
      cause,
    })
  }
  if (!isInside(canonicalRoot, canonicalTarget)) {
    throw new TypeError(`Catalog ${input.kind} path escapes snapshot: ${path}`)
  }
  const info = await stat(canonicalTarget)
  if (input.kind === 'package' ? !info.isDirectory() : !info.isFile()) {
    throw new TypeError(
      `Catalog ${input.kind} path is not a ${input.kind === 'package' ? 'directory' : 'regular file'}: ${path}`,
    )
  }
  return canonicalTarget
}

async function validateReplay(
  snapshotRoot: string,
  replay: CatalogReplayPayload,
  validatedArtifacts: Set<string>,
): Promise<void> {
  if (replay.source.kind === 'local') {
    await validateContainedPath({
      snapshotRoot,
      relativePath: replay.source.path,
      kind: 'package',
    })
  }
  if (validatedArtifacts.has(replay.lock.path)) return
  const artifact = await validateContainedPath({
    snapshotRoot,
    relativePath: replay.lock.path,
    kind: 'resolution artifact',
  })
  const info = await stat(artifact)
  if (info.size !== replay.lock.byteLength) {
    throw new TypeError('Catalog resolution artifact byte length mismatch')
  }
  const bytes = new Uint8Array(await Bun.file(artifact).arrayBuffer())
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== replay.lock.digest) {
    throw new TypeError('Catalog resolution artifact digest mismatch')
  }
  validatedArtifacts.add(replay.lock.path)
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
  const validatedArtifacts = new Set<string>()
  for (const entry of manifest.extensions) {
    const replay =
      entry.source.kind === 'literal'
        ? entry.source.authorPackage
        : entry.source.replay
    if (entry.source.kind === 'literal') {
      await validateContainedPath({
        snapshotRoot,
        relativePath: entry.source.locator.module,
        kind: 'module',
      })
      if (entry.source.locator.catalogId !== manifest.catalog.id) {
        throw new TypeError('Catalog literal locator Catalog id mismatch')
      }
    }
    await validateReplay(snapshotRoot, replay, validatedArtifacts)
  }
  return manifest
}
