import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, posix, resolve } from 'node:path'
import type {
  AnyCatalogDefinition,
  ExtensionPackageTarget,
} from '@ctxindex/extension-sdk'
import type {
  ExtensionPackageAuthoringSelection,
  ResolvedAuthoringCandidate,
} from '../direct-extension/service'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import {
  CATALOG_RESOLUTION_MAX_BYTES,
  type CatalogManifest,
  type CatalogManifestEntry,
  type CatalogReplayPayload,
  catalogManifestSchema,
  parseCatalogManifest,
  validateCatalogRelativePath,
} from './schema'

export type CatalogAuthoringSelection = ExtensionPackageAuthoringSelection

export type CatalogAuthoringResolution = ResolvedAuthoringCandidate

export interface CatalogAuthoringInstaller {
  resolveForAuthoring(input: {
    readonly target: ExtensionPackageTarget
    readonly selection: CatalogAuthoringSelection
    readonly immutableBaseRoot: string
    readonly signal?: AbortSignal
  }): Promise<CatalogAuthoringResolution>
}

export interface BuildCatalogSnapshotInput {
  readonly packageRoot: string
  readonly outputPath: string
  readonly catalogId?: string
  readonly trusted: boolean
  readonly installer: CatalogAuthoringInstaller
  readonly warn?: (message: string) => void | Promise<void>
  readonly signal?: AbortSignal
}

export interface BuildCatalogSnapshotResult {
  readonly changed: boolean
  readonly outputPath: string
  readonly manifest: CatalogManifest
}

interface PackageMetadata {
  readonly name: string
  readonly version: string
  readonly module: string
}

interface PendingArtifact {
  readonly relativePath: string
  readonly bytes: Uint8Array
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDeclaredModule(value: string): string {
  if (
    value.length === 0 ||
    value.includes('\0') ||
    value.includes('\\') ||
    value.includes('#') ||
    value.includes('?') ||
    isAbsolute(value)
  ) {
    throw new TypeError('Invalid Catalog entry module')
  }
  const withoutDot = value.startsWith('./') ? value.slice(2) : value
  if (posix.normalize(withoutDot) !== withoutDot) {
    throw new TypeError('Invalid Catalog entry module')
  }
  return validateCatalogRelativePath(withoutDot)
}

async function readPackageMetadata(
  packageRoot: string,
): Promise<PackageMetadata> {
  let value: unknown
  try {
    value = JSON.parse(
      await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
    )
  } catch (cause) {
    throw new TypeError('Catalog package.json could not be read', { cause })
  }
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.name.length === 0 ||
    typeof value.version !== 'string' ||
    value.version.length === 0 ||
    !isRecord(value.ctxindex) ||
    !Array.isArray(value.ctxindex.extensions)
  ) {
    throw new TypeError('Invalid Catalog package metadata')
  }
  if (
    value.ctxindex.extensions.length !== 1 ||
    typeof value.ctxindex.extensions[0] !== 'string'
  ) {
    throw new TypeError(
      'Catalog authoring must use a single Catalog entry module',
    )
  }
  return {
    name: value.name,
    version: value.version,
    module: normalizeDeclaredModule(value.ctxindex.extensions[0]),
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((byte, index) => byte === right[index])
  )
}

function snapshotArtifact(
  resolution: CatalogAuthoringResolution,
  artifacts: Map<string, PendingArtifact>,
): CatalogReplayPayload {
  const artifact = resolution.dependencyResolutionArtifact
  if (
    artifact.format !== 'bun.lock@1.3.14' ||
    artifact.bytes.byteLength === 0 ||
    artifact.bytes.byteLength > CATALOG_RESOLUTION_MAX_BYTES
  ) {
    throw new TypeError('Invalid Catalog dependency-resolution artifact')
  }
  const bytes = new Uint8Array(artifact.bytes)
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== artifact.digest) {
    throw new TypeError(
      'Catalog dependency-resolution artifact digest mismatch',
    )
  }
  const relativePath = `ctxindex-resolutions/${digest}.json`
  const prior = artifacts.get(digest)
  if (prior !== undefined && !equalBytes(prior.bytes, bytes)) {
    throw new TypeError('Conflicting Catalog dependency-resolution artifact')
  }
  artifacts.set(digest, { relativePath, bytes })
  return {
    ...resolution.replay,
    lock: {
      format: artifact.format,
      path: relativePath,
      digest,
      byteLength: bytes.byteLength,
    },
  }
}

function requireSelectedCatalog(
  resolution: CatalogAuthoringResolution,
  requestedId: string | undefined,
): AnyCatalogDefinition {
  const selected = resolution.selectedRoot
  if (
    selected.kind !== 'catalog' ||
    (requestedId !== undefined && selected.id !== requestedId)
  ) {
    throw new TypeError('Catalog authoring resolved the wrong Catalog root')
  }
  return selected
}

function requireSelectedExtension(
  resolution: CatalogAuthoringResolution,
  extensionId: string,
): void {
  if (
    resolution.selectedRoot.kind !== 'extension' ||
    resolution.selectedRoot.id !== extensionId
  ) {
    throw new TypeError('Catalog authoring resolved the wrong Extension root')
  }
}

function validateUniqueCatalogEntryIds(catalog: AnyCatalogDefinition): void {
  const ids = new Set<string>()
  for (const entry of catalog.extensions) {
    const id = entry.kind === 'extension' ? entry.id : entry.extensionId
    if (ids.has(id)) {
      throw new TypeError(`Duplicate Catalog Extension id ${id}`)
    }
    ids.add(id)
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([key, child]) => [key, canonicalValue(child)]),
  )
}

async function writeTemporary(
  path: string,
  value: string | Uint8Array,
): Promise<void> {
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(value)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function publishArtifact(
  outputRoot: string,
  artifact: PendingArtifact,
): Promise<void> {
  const target = resolve(outputRoot, artifact.relativePath)
  const directory = dirname(target)
  await mkdir(directory, { recursive: true })
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeTemporary(temporary, artifact.bytes)
    try {
      await link(temporary, target)
      await syncDirectory(directory)
    } catch (cause) {
      if ((cause as { code?: unknown }).code !== 'EEXIST') throw cause
      const existing = new Uint8Array(await readFile(target))
      if (!equalBytes(existing, artifact.bytes)) {
        throw new TypeError(
          `Catalog resolution artifact collision at ${artifact.relativePath}`,
        )
      }
    }
  } finally {
    await rm(temporary, { force: true })
  }
}

async function publishManifest(
  outputPath: string,
  text: string,
): Promise<void> {
  const directory = dirname(outputPath)
  await mkdir(directory, { recursive: true })
  const temporary = `${outputPath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await writeTemporary(temporary, text)
    await rename(temporary, outputPath)
    await syncDirectory(directory)
  } finally {
    await rm(temporary, { force: true })
  }
}

export async function buildCatalogSnapshot(
  input: BuildCatalogSnapshotInput,
): Promise<BuildCatalogSnapshotResult> {
  if (!input.trusted) {
    throw new TypeError('Catalog build requires explicit author trust')
  }
  await input.warn?.(
    'Catalog build will evaluate the trusted author package and resolve its package entries.',
  )

  const packageRoot = resolve(input.packageRoot)
  const outputPath = resolve(packageRoot, input.outputPath)
  const metadata = await readPackageMetadata(packageRoot)
  const artifacts = new Map<string, PendingArtifact>()
  const authorSelection: CatalogAuthoringSelection = {
    kind: 'catalog',
    module: metadata.module,
    ...(input.catalogId === undefined ? {} : { catalogId: input.catalogId }),
  }
  const authorResolution = await input.installer.resolveForAuthoring({
    target: { kind: 'local', target: '.' },
    selection: authorSelection,
    immutableBaseRoot: packageRoot,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })

  let catalog: AnyCatalogDefinition
  let authorReplay: CatalogReplayPayload
  try {
    catalog = requireSelectedCatalog(authorResolution, input.catalogId)
    validateUniqueCatalogEntryIds(catalog)
    authorReplay = snapshotArtifact(authorResolution, artifacts)
  } finally {
    await authorResolution.dispose()
  }

  const entries: CatalogManifestEntry[] = []
  for (const [entryIndex, entry] of catalog.extensions.entries()) {
    const summary =
      catalog.entrySummaries?.[
        entry.kind === 'extension' ? entry.id : entry.extensionId
      ]
    if (entry.kind === 'extension') {
      entries.push({
        id: entry.id,
        ...(summary === undefined ? {} : { summary }),
        source: {
          kind: 'literal',
          authorPackage: authorReplay,
          locator: {
            module: metadata.module,
            catalogId: catalog.id,
            entryIndex,
            extensionId: entry.id,
          },
        },
      })
      continue
    }

    const selection: CatalogAuthoringSelection = {
      kind: 'extension',
      extensionId: entry.extensionId,
    }
    const resolution = await input.installer.resolveForAuthoring({
      target: entry.source,
      selection,
      immutableBaseRoot: packageRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    try {
      requireSelectedExtension(resolution, entry.extensionId)
      entries.push({
        id: entry.extensionId,
        ...(summary === undefined ? {} : { summary }),
        source: {
          kind: 'package',
          replay: snapshotArtifact(resolution, artifacts),
        },
      })
    } finally {
      await resolution.dispose()
    }
  }

  entries.sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
  const manifest = catalogManifestSchema.parse({
    schemaVersion: 2,
    catalog: {
      id: catalog.id,
      label: catalog.label,
      ...(catalog.summary === undefined ? {} : { summary: catalog.summary }),
    },
    generated: {
      packageName: metadata.name,
      packageVersion: metadata.version,
    },
    extensions: entries,
  })
  const text = `${JSON.stringify(canonicalValue(manifest), null, 2)}\n`
  parseCatalogManifest(text)

  const outputRoot = dirname(outputPath)
  for (const artifact of [...artifacts.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.relativePath, right.relativePath),
  )) {
    await publishArtifact(outputRoot, artifact)
  }

  let prior: string | undefined
  try {
    prior = await readFile(outputPath, 'utf8')
  } catch (cause) {
    if ((cause as { code?: unknown }).code !== 'ENOENT') throw cause
  }
  if (prior === text) return { changed: false, outputPath, manifest }

  await publishManifest(outputPath, text)
  return { changed: true, outputPath, manifest }
}
