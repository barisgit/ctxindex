import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexValidationError,
} from '../errors'
import { newId } from '../ids'
import { dataDir } from '../paths'
import { parseRef } from '../ref'
import type { CtxindexDatabase } from '../storage/db'

const HASH_PREFIX = 'sha256:'
const HASH_PATTERN = /^[0-9a-f]{64}$/
const PURGE_ENTRY_PATTERN = /^\.purge-[0-9A-HJKMNP-TV-Z]{26}-(sha256|tmp)$/

export interface ArtifactMetadataInput {
  readonly ref: string
  readonly originRef: string
  readonly mediaType: string
  readonly byteSize?: number | undefined
  readonly retentionClass: 'cached'
}

async function treeAccounting(path: string): Promise<{
  objectCount: number
  physicalBytes: number
}> {
  let root: Awaited<ReturnType<typeof lstat>>
  try {
    root = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { objectCount: 0, physicalBytes: 0 }
    throw error
  }
  if (root.isFile()) return { objectCount: 1, physicalBytes: root.size }
  if (!root.isDirectory()) return { objectCount: 0, physicalBytes: 0 }
  const entries = await readdir(path, { withFileTypes: true })
  let objectCount = 0
  let physicalBytes = 0
  for (const entry of entries) {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) {
      const nested = await treeAccounting(entryPath)
      objectCount += nested.objectCount
      physicalBytes += nested.physicalBytes
    } else if (entry.isFile()) {
      const details = await lstat(entryPath)
      objectCount += 1
      physicalBytes += details.size
    }
  }
  return { objectCount, physicalBytes }
}

async function staleQuarantineEntries(root: string): Promise<string[]> {
  let entries: string[]
  try {
    entries = await readdir(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const result: string[] = []
  for (const name of entries.sort()) {
    if (!PURGE_ENTRY_PATTERN.test(name)) continue
    const path = join(root, name)
    try {
      const entry = await lstat(path)
      if (entry.isDirectory() || entry.isFile()) result.push(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  return result
}

export interface ArtifactPurgeResult {
  readonly artifactCountRemoved: number
  readonly objectCountRemoved: number
  readonly logicalBytesFreed: number
  readonly physicalBytesFreed: number
  readonly diskAccounting: ArtifactDiskAccounting
}

export interface Artifact {
  readonly ref: string
  readonly originRef: string
  readonly contentHash: string
  readonly mediaType: string
  readonly byteSize: number
  readonly retentionClass: 'cached'
  readonly localPath: string
  readonly createdAt: number
}

export interface ArtifactWriter {
  write(bytes: Uint8Array): Promise<void>
  commit(metadata: ArtifactMetadataInput): Promise<Artifact>
  abort(): Promise<void>
}

export interface ArtifactStoreOptions {
  readonly root?: string
  readonly clock?: () => number
  readonly purgeId?: () => string
}

export interface ArtifactDiskAccounting {
  readonly artifactCount: number
  readonly objectCount: number
  readonly logicalBytes: number
  readonly physicalBytes: number
}

interface ArtifactRow {
  readonly ref: string
  readonly origin_ref: string
  readonly content_hash: string
  readonly media_type: string
  readonly byte_size: number
  readonly retention_class: 'cached'
  readonly local_path: string
  readonly created_at: number
}

function fromRow(row: ArtifactRow): Artifact {
  return {
    ref: row.ref,
    originRef: row.origin_ref,
    contentHash: row.content_hash,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    retentionClass: row.retention_class,
    localPath: row.local_path,
    createdAt: row.created_at,
  }
}

function integrityError(message: string, cause?: unknown): CtxindexError {
  return new CtxindexError(message, 'data_integrity', { cause })
}

async function hashFile(path: string): Promise<{ hex: string; size: number }> {
  const hash = createHash('sha256')
  let size = 0
  try {
    for await (const chunk of createReadStream(path)) {
      const bytes = chunk as Buffer
      hash.update(bytes)
      size += bytes.byteLength
    }
  } catch (error) {
    throw integrityError(`Artifact CAS object is unreadable: ${path}`, error)
  }
  return { hex: hash.digest('hex'), size }
}

async function verifyObject(
  path: string,
  expectedHex: string,
  expectedSize: number,
): Promise<void> {
  const actual = await hashFile(path)
  if (actual.hex !== expectedHex || actual.size !== expectedSize) {
    throw integrityError(
      `Artifact CAS object failed integrity verification: ${path}`,
    )
  }
}

function validateMetadata(metadata: ArtifactMetadataInput): void {
  if (metadata.retentionClass !== 'cached') {
    throw new CtxindexValidationError(
      'invalid_artifact_retention',
      'V1 Artifact retention class must be cached',
    )
  }
  const artifact = parseRef(metadata.ref)
  const origin = parseRef(metadata.originRef)
  if (artifact.sourceId !== origin.sourceId) {
    throw new CtxindexValidationError(
      'ref_source_mismatch',
      'Artifact Ref and origin Ref must belong to the same Source',
    )
  }
  const artifactPrefix = `${metadata.originRef}/`
  if (
    !metadata.ref.startsWith(artifactPrefix) ||
    metadata.ref.length === artifactPrefix.length
  ) {
    throw new CtxindexValidationError(
      'invalid_artifact_ref',
      'Artifact Ref must extend its exact origin Ref by a nonempty suffix',
    )
  }
}

export class ArtifactStore {
  readonly root: string
  private readonly clock: () => number
  private readonly purgeId: () => string

  constructor(
    private readonly db: CtxindexDatabase,
    options: ArtifactStoreOptions = {},
  ) {
    this.root = options.root ?? join(dataDir(), 'artifacts')
    this.clock = options.clock ?? Date.now
    this.purgeId = options.purgeId ?? newId
  }

  async write(
    metadata: ArtifactMetadataInput,
    produce: (writer: ArtifactWriter) => Promise<void>,
  ): Promise<Artifact> {
    const writer = await this.createWriter()
    try {
      await produce(writer)
      return await writer.commit(metadata)
    } catch (error) {
      await writer.abort()
      throw error
    }
  }

  async createWriter(): Promise<ArtifactWriter> {
    const tempRoot = join(this.root, '.tmp')
    await mkdir(tempRoot, { recursive: true, mode: 0o700 })
    const tempDir = await mkdtemp(join(tempRoot, 'write-'))
    const tempPath = join(tempDir, 'content')
    const file = await open(tempPath, 'wx', 0o600)
    const hash = createHash('sha256')
    let byteSize = 0
    let state: 'open' | 'committing' | 'closed' = 'open'

    const cleanup = async (): Promise<void> => {
      await file.close().catch(() => undefined)
      await rm(tempDir, { recursive: true, force: true })
    }

    const abort = async (): Promise<void> => {
      if (state === 'closed') return
      state = 'closed'
      await cleanup()
    }

    return {
      write: async (bytes) => {
        if (state !== 'open') throw new Error('Artifact writer is not open')
        try {
          await file.writeFile(bytes)
          hash.update(bytes)
          byteSize += bytes.byteLength
        } catch (error) {
          state = 'closed'
          await cleanup()
          throw error
        }
      },
      commit: async (metadata) => {
        if (state !== 'open') throw new Error('Artifact writer is not open')
        state = 'committing'
        try {
          validateMetadata(metadata)
          const owner = this.db
            .prepare('SELECT id FROM resources WHERE ref = ?')
            .get(metadata.originRef) as { id: string } | null
          if (!owner) {
            throw new CtxindexNotFoundError(
              `Artifact origin Resource not found: ${metadata.originRef}`,
            )
          }

          await file.sync()
          await file.close()
          if (
            metadata.byteSize !== undefined &&
            metadata.byteSize !== byteSize
          ) {
            throw new CtxindexValidationError(
              'invalid_artifact_ref',
              `Artifact byte size does not match its descriptor: ${metadata.ref}`,
            )
          }
          const hex = hash.digest('hex')
          const contentHash = `${HASH_PREFIX}${hex}`
          const localPath = `sha256/${hex.slice(0, 2)}/${hex}`
          const objectPath = join(this.root, localPath)
          const existing = this.db
            .prepare('SELECT * FROM artifacts WHERE ref = ?')
            .get(metadata.ref) as ArtifactRow | null
          if (existing) {
            if (
              existing.origin_ref !== metadata.originRef ||
              existing.content_hash !== contentHash ||
              existing.media_type !== metadata.mediaType ||
              existing.byte_size !== byteSize ||
              existing.retention_class !== metadata.retentionClass ||
              existing.local_path !== localPath
            ) {
              throw integrityError(
                `Artifact Ref cannot be rebound to different content or metadata: ${metadata.ref}`,
              )
            }
            await verifyObject(objectPath, hex, byteSize)
            state = 'closed'
            return fromRow(existing)
          }

          await mkdir(join(this.root, 'sha256', hex.slice(0, 2)), {
            recursive: true,
            mode: 0o700,
          })
          try {
            await link(tempPath, objectPath)
            await chmod(objectPath, 0o600)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
            await verifyObject(objectPath, hex, byteSize)
          }

          const createdAt = this.clock()
          const insert = this.db
            .prepare(
              `INSERT INTO artifacts (
                id, ref, resource_id, origin_ref, content_hash, media_type,
                byte_size, retention_class, local_path, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(ref) DO NOTHING`,
            )
            .run(
              newId(),
              metadata.ref,
              owner.id,
              metadata.originRef,
              contentHash,
              metadata.mediaType,
              byteSize,
              metadata.retentionClass,
              localPath,
              createdAt,
            )
          if (insert.changes === 0) {
            const raced = this.db
              .prepare('SELECT * FROM artifacts WHERE ref = ?')
              .get(metadata.ref) as ArtifactRow | null
            if (
              !raced ||
              raced.origin_ref !== metadata.originRef ||
              raced.content_hash !== contentHash ||
              raced.media_type !== metadata.mediaType ||
              raced.byte_size !== byteSize ||
              raced.retention_class !== metadata.retentionClass ||
              raced.local_path !== localPath
            ) {
              throw integrityError(
                `Artifact Ref cannot be rebound to different content or metadata: ${metadata.ref}`,
              )
            }
            await verifyObject(objectPath, hex, byteSize)
            state = 'closed'
            return fromRow(raced)
          }
          state = 'closed'
          return {
            ref: metadata.ref,
            originRef: metadata.originRef,
            mediaType: metadata.mediaType,
            retentionClass: metadata.retentionClass,
            contentHash,
            byteSize,
            localPath,
            createdAt,
          }
        } finally {
          state = 'closed'
          await cleanup()
        }
      },
      abort,
    }
  }

  async get(ref: string): Promise<Artifact | undefined> {
    parseRef(ref)
    const row = this.db
      .prepare('SELECT * FROM artifacts WHERE ref = ?')
      .get(ref) as ArtifactRow | null
    if (!row) return undefined
    const hex = row.content_hash.startsWith(HASH_PREFIX)
      ? row.content_hash.slice(HASH_PREFIX.length)
      : ''
    if (!HASH_PATTERN.test(hex)) {
      throw integrityError(
        `Artifact metadata has an invalid content hash: ${ref}`,
      )
    }
    const expectedPath = `sha256/${hex.slice(0, 2)}/${hex}`
    if (row.local_path !== expectedPath) {
      throw integrityError(
        `Artifact metadata has an invalid local path: ${ref}`,
      )
    }
    await verifyObject(join(this.root, expectedPath), hex, row.byte_size)
    return fromRow(row)
  }

  async read(
    ref: string,
  ): Promise<
    { readonly artifact: Artifact; readonly bytes: Uint8Array } | undefined
  > {
    const artifact = await this.get(ref)
    if (!artifact) return undefined
    const bytes = new Uint8Array(
      await readFile(join(this.root, artifact.localPath)),
    )
    const contentHash = `${HASH_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`
    if (
      bytes.byteLength !== artifact.byteSize ||
      contentHash !== artifact.contentHash
    )
      throw integrityError(`Artifact cache object failed verification: ${ref}`)
    return {
      artifact,
      bytes: bytes.slice(),
    }
  }

  async copyTo(ref: string, outputPath: string): Promise<void> {
    const artifact = await this.get(ref)
    if (!artifact) throw new CtxindexNotFoundError(`Artifact not found: ${ref}`)
    const directory = dirname(outputPath)
    const tempDir = await mkdtemp(
      join(directory, `.${basename(outputPath)}.ctxindex-`),
    )
    const tempPath = join(tempDir, 'content')
    try {
      await copyFile(join(this.root, artifact.localPath), tempPath)
      await chmod(tempPath, 0o600)
      try {
        await link(tempPath, outputPath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new CtxindexError(
            `Output path already exists: ${outputPath}`,
            'output_exists',
          )
        }
        throw error
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  async purge(): Promise<ArtifactPurgeResult> {
    const metadata = this.db
      .prepare(
        'SELECT COUNT(*) AS artifact_count, COALESCE(SUM(byte_size), 0) AS logical_bytes FROM artifacts',
      )
      .get() as { artifact_count: number; logical_bytes: number }
    const trees = ['sha256', '.tmp'] as const
    let stale: string[]
    let accounting: { objectCount: number; physicalBytes: number }[]
    try {
      stale = await staleQuarantineEntries(this.root)
      accounting = await Promise.all([
        ...trees.map((name) => treeAccounting(join(this.root, name))),
        ...stale.map((path) => treeAccounting(path)),
      ])
    } catch (error) {
      throw integrityError(
        'Artifact purge could not inspect managed bytes',
        error,
      )
    }
    const objectCountRemoved = accounting.reduce(
      (total, item) => total + item.objectCount,
      0,
    )
    const physicalBytesFreed = accounting.reduce(
      (total, item) => total + item.physicalBytes,
      0,
    )

    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 })
    } catch (error) {
      throw integrityError(
        'Artifact purge could not access the store root',
        error,
      )
    }

    try {
      this.db
        .transaction(() => {
          this.db.prepare('DELETE FROM artifacts').run()
        })
        .immediate()
    } catch (error) {
      throw integrityError(
        'Artifact purge could not delete cache metadata; managed bytes were left untouched',
        error,
      )
    }

    const purgeId = this.purgeId()
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(purgeId)) {
      throw integrityError('Artifact purge generated an invalid quarantine id')
    }
    const quarantine = trees.map((name) => ({
      source: join(this.root, name),
      target: join(
        this.root,
        `.purge-${purgeId}-${name === '.tmp' ? 'tmp' : name}`,
      ),
    }))
    const moved: string[] = []
    try {
      for (const entry of quarantine) {
        try {
          await rename(entry.source, entry.target)
          moved.push(entry.target)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    } catch (error) {
      throw integrityError(
        'Artifact purge deleted cache metadata but could not quarantine all managed bytes',
        error,
      )
    }

    let cleanupError: unknown
    for (const path of new Set([...stale, ...moved])) {
      try {
        await rm(path, { recursive: true, force: true })
      } catch (error) {
        cleanupError ??= error
      }
    }
    if (cleanupError) {
      throw integrityError(
        'Artifact purge deleted cache metadata but could not remove all quarantined bytes',
        cleanupError,
      )
    }

    let diskAccounting: ArtifactDiskAccounting
    try {
      diskAccounting = await this.diskAccounting()
    } catch (error) {
      throw integrityError(
        'Artifact purge could not verify post-purge disk accounting',
        error,
      )
    }
    return {
      artifactCountRemoved: metadata.artifact_count,
      objectCountRemoved,
      logicalBytesFreed: metadata.logical_bytes,
      physicalBytesFreed,
      diskAccounting,
    }
  }

  async diskAccounting(): Promise<ArtifactDiskAccounting> {
    const totals = this.db
      .prepare(
        'SELECT COUNT(*) AS artifact_count, COALESCE(SUM(byte_size), 0) AS logical_bytes FROM artifacts',
      )
      .get() as { artifact_count: number; logical_bytes: number }
    let objectCount = 0
    let physicalBytes = 0
    const hashRoot = join(this.root, 'sha256')
    let buckets: string[] = []
    try {
      buckets = await readdir(hashRoot)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    for (const bucket of buckets) {
      if (!/^[0-9a-f]{2}$/.test(bucket)) continue
      for (const name of await readdir(join(hashRoot, bucket))) {
        if (!HASH_PATTERN.test(name)) continue
        const entry = await stat(join(hashRoot, bucket, name))
        if (!entry.isFile()) continue
        objectCount += 1
        physicalBytes += entry.size
      }
    }
    return {
      artifactCount: totals.artifact_count,
      objectCount,
      logicalBytes: totals.logical_bytes,
      physicalBytes,
    }
  }
}
