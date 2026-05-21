import { readFile } from 'node:fs/promises'
import type { SyncContext, SyncFunction } from '@ctxindex/core/registry'
import { ulid } from 'ulid'
import { chunkText } from './chunker'
import { sha256Hex } from './hash'
import { detectMime } from './mime'
import { walkDirectory } from './walker'

const SIZE_CAP_BYTES = 2 * 1024 * 1024 // 2 MiB default

export interface LocalDirectoryConfig {
  root_path: string
  include?: string[]
  exclude?: string[]
  size_cap_bytes?: number
}

export const localDirectorySync: SyncFunction =
  async function* localDirectorySync(ctx: SyncContext) {
    const config =
      ctx.cursor !== null
        ? ((ctx.cursor as { config?: LocalDirectoryConfig }).config ??
          ({} as LocalDirectoryConfig))
        : ({} as LocalDirectoryConfig)

    // Config comes through the source record's config_json
    // In tests, we pass root_path via a special field in the logger context
    const rootPath: string =
      (ctx as unknown as { rootPath?: string }).rootPath ??
      config.root_path ??
      '.'

    const sizeCap = config.size_cap_bytes ?? SIZE_CAP_BYTES

    const walkOpts: { include?: string[]; exclude?: string[] } = {}
    if (config.include) walkOpts.include = config.include
    if (config.exclude) walkOpts.exclude = config.exclude
    const entries = await walkDirectory(rootPath, walkOpts)

    for (const entry of entries) {
      if (ctx.signal.aborted) {
        yield { type: 'cancelled' }
        return
      }

      // Skip oversize files
      if (entry.size > sizeCap) {
        yield {
          type: 'error',
          message: `file too large (${entry.size} bytes): ${entry.relativePath}`,
          path: entry.relativePath,
        }
        continue
      }

      // Detect MIME
      const mimeResult = await detectMime(entry.absolutePath)
      if (mimeResult.isBinary) {
        yield {
          type: 'error',
          message: `binary file skipped: ${entry.relativePath}`,
          path: entry.relativePath,
        }
        continue
      }

      // Read content
      let content: string
      try {
        content = await readFile(entry.absolutePath, 'utf8')
      } catch (err) {
        yield {
          type: 'error',
          message: `read error: ${entry.relativePath}: ${String(err)}`,
          path: entry.relativePath,
        }
        continue
      }

      const contentHash = await sha256Hex(content)
      const itemId = ulid()

      yield {
        type: 'upsertItem',
        itemId,
        sourceId: ctx.sourceId,
        uri: `file://${entry.absolutePath}`,
        title: entry.relativePath.split('/').pop() ?? entry.relativePath,
        kind: 'directory',
        contentHash,
        byteSize: entry.size,
        indexedAt: Date.now(),
        mtime: entry.mtime,
        relativePath: entry.relativePath,
      }

      // Chunk and emit
      const chunks = chunkText(content)
      for (const chunk of chunks) {
        yield {
          type: 'upsertChunk',
          chunkId: ulid(),
          itemId,
          chunkIndex: chunk.index,
          content: chunk.content,
        }
      }

      // Checkpoint every 100 files
      if (entries.indexOf(entry) % 100 === 99) {
        yield {
          type: 'checkpoint',
          cursor: JSON.stringify({
            mtime: entry.mtime,
            path: entry.relativePath,
          }),
        }
      }
    }

    yield {
      type: 'setCursor',
      cursor: JSON.stringify({ completedAt: Date.now() }),
    }
  }
