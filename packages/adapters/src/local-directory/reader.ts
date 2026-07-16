import { createHash } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import type { WalkerEntry } from './walker'

export interface ReaderWarning {
  readonly code:
    | 'oversize_skipped'
    | 'binary_skipped'
    | 'stat_failed'
    | 'read_failed'
  readonly message: string
  readonly path: string
}

export type ReadLocalFileResult =
  | {
      readonly status: 'success'
      readonly mediaType: string
      readonly byteSize: number
      readonly modifiedAt: string
      readonly contentHash: string
      readonly text: string
    }
  | { readonly status: 'warning'; readonly warning: ReaderWarning }

function warning(
  code: ReaderWarning['code'],
  message: string,
  path: string,
): ReadLocalFileResult {
  return { status: 'warning', warning: { code, message, path } }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException('The operation was aborted', 'AbortError')
    )
  }
}

export async function readLocalFile(
  entry: WalkerEntry,
  sizeCapBytes: number,
  signal?: AbortSignal,
): Promise<ReadLocalFileResult> {
  checkCancelled(signal)
  if (entry.size > sizeCapBytes) {
    return warning(
      'oversize_skipped',
      `Skipped oversized file: ${entry.relativePath}`,
      entry.relativePath,
    )
  }

  let handle: FileHandle
  try {
    handle = await open(
      entry.absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    )
  } catch {
    checkCancelled(signal)
    return warning(
      'read_failed',
      `Could not read file: ${entry.relativePath}`,
      entry.relativePath,
    )
  }

  try {
    checkCancelled(signal)
    let before: Stats
    try {
      before = await handle.stat()
    } catch {
      return warning(
        'stat_failed',
        `Could not inspect file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (!before.isFile()) {
      return warning(
        'stat_failed',
        `Could not inspect file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (before.size > sizeCapBytes) {
      return warning(
        'oversize_skipped',
        `Skipped oversized file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (before.size !== entry.size || before.mtimeMs !== entry.mtime) {
      return warning(
        'read_failed',
        `File changed before reading: ${entry.relativePath}`,
        entry.relativePath,
      )
    }

    const buffer = Buffer.alloc(sizeCapBytes + 1)
    let bytesRead = 0
    while (bytesRead < buffer.length) {
      checkCancelled(signal)
      let read: Awaited<ReturnType<FileHandle['read']>>
      try {
        read = await handle.read(
          buffer,
          bytesRead,
          buffer.length - bytesRead,
          bytesRead,
        )
      } catch {
        checkCancelled(signal)
        return warning(
          'read_failed',
          `Could not read file: ${entry.relativePath}`,
          entry.relativePath,
        )
      }
      if (read.bytesRead === 0) break
      bytesRead += read.bytesRead
    }
    checkCancelled(signal)

    let after: Stats
    try {
      after = await handle.stat()
    } catch {
      return warning(
        'stat_failed',
        `Could not inspect file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (bytesRead > sizeCapBytes || after.size > sizeCapBytes) {
      return warning(
        'oversize_skipped',
        `Skipped oversized file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (
      after.size !== bytesRead ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    ) {
      return warning(
        'read_failed',
        `File changed while reading: ${entry.relativePath}`,
        entry.relativePath,
      )
    }

    const bytes = buffer.subarray(0, bytesRead)
    let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>
    try {
      detected = await fileTypeFromBuffer(bytes)
    } catch {
      detected = undefined
    }
    if (detected && !detected.mime.startsWith('text/')) {
      return warning(
        'binary_skipped',
        `Skipped binary file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }
    if (bytes.includes(0)) {
      return warning(
        'binary_skipped',
        `Skipped binary file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }

    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      return warning(
        'binary_skipped',
        `Skipped binary file: ${entry.relativePath}`,
        entry.relativePath,
      )
    }

    return {
      status: 'success',
      mediaType: detected?.mime ?? 'text/plain',
      byteSize: bytesRead,
      modifiedAt: after.mtime.toISOString(),
      contentHash: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      text,
    }
  } finally {
    await handle.close()
  }
}
