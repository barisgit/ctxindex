import { posix } from 'node:path'
import type {
  SyncContext,
  SyncEmission,
  SyncedResource,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import {
  DEFAULT_SIZE_CAP_BYTES,
  localDirectorySourceConfigSchema,
} from './config'
import { compareCodePoints } from './order'
import { type ReadLocalFileResult, readLocalFile } from './reader'
import { localDirectoryRef } from './ref'
import { type WalkResult, walkDirectory } from './walker'

const manifestRecordSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .refine(
        (path) =>
          !path.startsWith('/') &&
          !path.includes('\\') &&
          path
            .split('/')
            .every((part) => part !== '' && part !== '.' && part !== '..'),
      ),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    byteSize: z.number().int().nonnegative(),
    modifiedAt: z.string().datetime(),
  })
  .strict()

const cursorSchema = z
  .object({
    version: z.literal(1),
    files: z.array(manifestRecordSchema),
  })
  .strict()
  .refine(
    (cursor) =>
      cursor.files.every((record, index) => {
        const previous = cursor.files[index - 1]
        return (
          previous === undefined ||
          compareCodePoints(previous.path, record.path) < 0
        )
      }),
    'manifest must be sorted with unique paths',
  )

type ManifestRecord = z.infer<typeof manifestRecordSchema>

interface PendingWarning {
  readonly path?: string
  readonly emission: Extract<SyncEmission, { type: 'warning' }>
}

function pathIsUncertain(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) =>
      prefix === '' || path === prefix || path.startsWith(`${prefix}/`),
  )
}

function unchanged(left: ManifestRecord, right: ManifestRecord): boolean {
  return (
    left.path === right.path &&
    left.contentHash === right.contentHash &&
    left.byteSize === right.byteSize &&
    left.modifiedAt === right.modifiedAt
  )
}

export async function localDirectorySync(context: SyncContext): Promise<void> {
  if (context.signal.aborted) return
  const config = localDirectorySourceConfigSchema.parse(context.source.config)
  const sizeCapBytes = config.size_cap_bytes ?? DEFAULT_SIZE_CAP_BYTES
  const parsedCursor = cursorSchema.safeParse(context.cursor)
  const cursorWasInvalid = context.cursor !== null && !parsedCursor.success
  const previousFiles = parsedCursor.success ? parsedCursor.data.files : []
  const previousByPath = new Map(
    previousFiles.map((record) => [record.path, record]),
  )
  const warnings: PendingWarning[] = []
  if (cursorWasInvalid) {
    warnings.push({
      emission: {
        type: 'warning',
        code: 'invalid_cursor',
        message: 'Ignored invalid local.directory cursor',
      },
    })
  }

  let walk: WalkResult
  try {
    walk = await walkDirectory(config.root_path, {
      ...(config.include ? { include: config.include } : {}),
      ...(config.exclude ? { exclude: config.exclude } : {}),
      signal: context.signal,
    })
  } catch (cause) {
    if (context.signal.aborted) return
    throw cause
  }
  if (context.signal.aborted) return

  for (const warning of walk.warnings) {
    warnings.push({
      path: warning.path,
      emission: {
        type: 'warning',
        code: warning.code,
        message: warning.message,
      },
    })
  }

  const manifest = new Map<string, ManifestRecord>()
  const upserts: SyncedResource[] = []
  const uncertainPrefixes = [...walk.uncertainPrefixes]

  for (const entry of walk.entries) {
    if (context.signal.aborted) return
    let read: ReadLocalFileResult
    try {
      read = await readLocalFile(entry, sizeCapBytes, context.signal)
    } catch (cause) {
      if (context.signal.aborted) return
      throw cause
    }
    if (read.status === 'warning') {
      warnings.push({
        path: read.warning.path,
        emission: {
          type: 'warning',
          code: read.warning.code,
          message: read.warning.message,
          ref: localDirectoryRef(context.source.id, entry.relativePath),
        },
      })
      if (
        read.warning.code === 'stat_failed' ||
        read.warning.code === 'read_failed'
      ) {
        uncertainPrefixes.push(entry.relativePath)
      }
      continue
    }

    const record: ManifestRecord = {
      path: entry.relativePath,
      contentHash: read.contentHash,
      byteSize: read.byteSize,
      modifiedAt: read.modifiedAt,
    }
    manifest.set(record.path, record)
    const previous = previousByPath.get(record.path)
    if (context.mode !== 'resync' && previous && unchanged(previous, record)) {
      continue
    }
    upserts.push({
      ref: localDirectoryRef(context.source.id, entry.relativePath),
      profile: { id: 'file', version: 1 },
      completeness: 'complete',
      payload: {
        path: entry.relativePath,
        name: posix.basename(entry.relativePath),
        mediaType: read.mediaType,
        byteSize: read.byteSize,
        modifiedAt: read.modifiedAt,
        contentHash: read.contentHash,
        text: read.text,
      },
    })
  }

  for (const previous of previousFiles) {
    if (
      !manifest.has(previous.path) &&
      pathIsUncertain(previous.path, uncertainPrefixes)
    ) {
      manifest.set(previous.path, previous)
    }
  }

  warnings.sort(
    (left, right) =>
      compareCodePoints(left.path ?? '', right.path ?? '') ||
      compareCodePoints(left.emission.code, right.emission.code),
  )
  for (const warning of warnings) {
    if (context.signal.aborted) return
    await context.emit(warning.emission)
  }
  for (const resource of upserts) {
    if (context.signal.aborted) return
    await context.emit({ type: 'upsertResource', resource })
  }
  if (!cursorWasInvalid) {
    const removals = previousFiles
      .filter((previous) => !manifest.has(previous.path))
      .sort((left, right) => compareCodePoints(left.path, right.path))
    for (const previous of removals) {
      if (context.signal.aborted) return
      await context.emit({
        type: 'removeResource',
        ref: localDirectoryRef(context.source.id, previous.path),
      })
    }
  }

  const files = [...manifest.values()].sort((left, right) =>
    compareCodePoints(left.path, right.path),
  )
  if (context.signal.aborted) return
  await context.emit({ type: 'checkpoint', cursor: { version: 1, files } })
}
