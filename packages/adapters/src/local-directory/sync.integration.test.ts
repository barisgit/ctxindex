/**
 * VAL-LOCAL-DIRECTORY integration test.
 *
 * Builds a temp directory tree, runs the local.directory adapter sync function,
 * applies ops to a fresh in-memory DB, then asserts all required rows exist.
 */
import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { ulid } from 'ulid'
import { localDirectoryAdapter } from './index'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let db: Database
let tmpDir: string

beforeEach(async () => {
  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  // Run core + local-directory adapter migrations
  await runMigrations(db, {
    adapterMigrations: [localDirectoryAdapter.migrations],
  })

  // Seed global realm + source
  db.prepare(
    "INSERT OR IGNORE INTO realms (id, slug, is_default, created_at) VALUES ('global', 'global', 1, ?)",
  ).run(Date.now())

  db.prepare(
    "INSERT INTO sources (id, realm_id, adapter_id, created_at) VALUES ('src-ld-01', 'global', 'local.directory', ?)",
  ).run(Date.now())

  tmpDir = await mkdtemp(join(tmpdir(), 'ctxindex-ld-test-'))
})

afterEach(async () => {
  try {
    db.close()
  } catch {
    /* ignore */
  }
  await rm(tmpDir, { recursive: true, force: true })
})

/**
 * Run adapter sync directly and apply ops to DB.
 * Returns { itemsAdded, chunksAdded, errors }
 */
async function runAdapterSync(rootPath: string): Promise<{
  itemsAdded: number
  chunksAdded: number
  errors: number
  runId: string
}> {
  const runId = ulid()
  const sourceId = 'src-ld-01'
  const realmId = 'global'

  db.prepare(
    "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at) VALUES (?, ?, ?, 'sync', 'running', ?)",
  ).run(runId, sourceId, realmId, Date.now())

  let itemsAdded = 0
  let chunksAdded = 0
  let errors = 0

  const abortController = new AbortController()
  const ctx = {
    sourceId,
    runId,
    mode: 'sync' as const,
    cursor: null,
    logger: {
      info: () => {},
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
    signal: abortController.signal,
    rootPath, // passed as extra field for the sync fn to use
  }

  // biome-ignore lint/suspicious/noExplicitAny: test helper
  for await (const op of (localDirectoryAdapter.sync as any)(ctx)) {
    const o = op as Record<string, unknown>

    if (o.type === 'upsertItem') {
      const itemId = o.itemId as string
      db.prepare(
        `INSERT OR REPLACE INTO items
           (id, source_id, realm_id, adapter_id, kind, uri, title,
            content_hash, byte_size, indexed_at, updated_at)
         VALUES (?, ?, ?, 'local.directory', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        itemId,
        sourceId,
        realmId,
        o.kind as string,
        o.uri as string,
        o.title as string,
        o.contentHash as string | null,
        o.byteSize as number,
        Date.now(),
        Date.now(),
      )
      // Track file state
      db.prepare(
        `INSERT OR REPLACE INTO local_directory_file_state
           (source_id, item_id, relative_path, content_hash, mtime_ms, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        sourceId,
        itemId,
        o.relativePath as string,
        o.contentHash as string | null,
        o.mtime as number,
        o.byteSize as number,
      )
      itemsAdded++
    } else if (o.type === 'upsertChunk') {
      db.prepare(
        `INSERT OR REPLACE INTO item_chunks
           (id, item_id, chunk_index, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        o.chunkId as string,
        o.itemId as string,
        o.chunkIndex as number,
        o.content as string,
        Date.now(),
      )
      chunksAdded++
    } else if (o.type === 'checkpoint') {
      db.prepare(
        `INSERT INTO sync_run_checkpoints (id, run_id, cursor_json, recorded_at) VALUES (?, ?, ?, ?)`,
      ).run(ulid(), runId, o.cursor as string, Date.now())
    } else if (o.type === 'error') {
      errors++
    }
  }

  // Complete the run
  db.prepare(
    `UPDATE sync_runs SET status='completed', completed_at=?, items_added=?, errors_count=? WHERE id=?`,
  ).run(Date.now(), itemsAdded, errors, runId)

  db.prepare(
    `INSERT INTO source_sync_state (source_id, last_status, last_run_id, cursor_json, updated_at)
     VALUES ('src-ld-01', 'idle', ?, ?, ?)
     ON CONFLICT(source_id) DO UPDATE SET
       last_status='idle', last_run_id=excluded.last_run_id,
       cursor_json=excluded.cursor_json, updated_at=excluded.updated_at`,
  ).run(runId, JSON.stringify({ completedAt: Date.now() }), Date.now())

  return { itemsAdded, chunksAdded, errors, runId }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('local.directory adapter', () => {
  test('walks and indexes text files, produces items + chunks + sync_run rows', async () => {
    // Build fixture tree
    await writeFile(
      join(tmpDir, 'README.md'),
      '# Project\n\nThis is the readme.\n\nSome more content here.',
    )
    await writeFile(
      join(tmpDir, 'main.ts'),
      'export function hello() {\n  return "world"\n}\n',
    )
    await mkdir(join(tmpDir, 'src'))
    await writeFile(
      join(tmpDir, 'src', 'utils.ts'),
      'export const add = (a: number, b: number) => a + b\n',
    )

    const { itemsAdded, chunksAdded, runId } = await runAdapterSync(tmpDir)

    expect(itemsAdded).toBe(3)
    expect(chunksAdded).toBeGreaterThanOrEqual(3)

    // items table
    const items = db
      .prepare("SELECT id, uri, kind FROM items WHERE source_id = 'src-ld-01'")
      .all()
    expect(items.length).toBe(3)
    for (const item of items as { id: string; uri: string; kind: string }[]) {
      expect(item.kind).toBe('file')
      expect(item.uri).toMatch(/^file:\/\//)
    }

    // item_chunks
    const chunks = db
      .prepare(
        "SELECT id FROM item_chunks WHERE item_id IN (SELECT id FROM items WHERE source_id = 'src-ld-01')",
      )
      .all()
    expect(chunks.length).toBeGreaterThanOrEqual(3)

    // sync_run completed
    const run = db
      .prepare('SELECT status, items_added FROM sync_runs WHERE id = ?')
      .get(runId) as { status: string; items_added: number }
    expect(run.status).toBe('completed')
    expect(run.items_added).toBe(3)

    // local_directory_file_state populated
    const state = db
      .prepare(
        "SELECT * FROM local_directory_file_state WHERE source_id = 'src-ld-01'",
      )
      .all()
    expect(state.length).toBe(3)
  })

  test('honours .gitignore exclusions', async () => {
    await writeFile(join(tmpDir, 'included.md'), '# Included')
    await mkdir(join(tmpDir, 'ignored_dir'))
    await writeFile(join(tmpDir, 'ignored_dir', 'secret.md'), '# Secret')
    await writeFile(join(tmpDir, '.gitignore'), 'ignored_dir/\n')

    const _unused = await runAdapterSync(tmpDir)

    const items = db
      .prepare("SELECT uri FROM items WHERE source_id = 'src-ld-01'")
      .all() as { uri: string }[]
    const uris = items.map((i) => i.uri)

    // .gitignore should be indexed (it's a text file), ignored_dir/secret.md should not
    expect(uris.some((u) => u.includes('included.md'))).toBe(true)
    expect(uris.some((u) => u.includes('secret.md'))).toBe(false)
  })

  test('honours .ctxindexignore exclusions', async () => {
    await writeFile(join(tmpDir, 'keep.md'), '# Keep')
    await writeFile(join(tmpDir, 'skip.log'), 'log content to skip')
    await writeFile(join(tmpDir, '.ctxindexignore'), '*.log\n')

    const _unused = await runAdapterSync(tmpDir)

    const items = db
      .prepare("SELECT uri FROM items WHERE source_id = 'src-ld-01'")
      .all() as { uri: string }[]
    const uris = items.map((i) => i.uri)

    expect(uris.some((u) => u.includes('keep.md'))).toBe(true)
    expect(uris.some((u) => u.includes('skip.log'))).toBe(false)
  })

  test('skips oversize files with error op (errors_count incremented)', async () => {
    await writeFile(join(tmpDir, 'normal.md'), '# Normal\n\nThis is fine.')
    // Create a >2MiB file
    const bigContent = Buffer.alloc(3 * 1024 * 1024, 'x')
    await writeFile(join(tmpDir, 'toobig.bin'), bigContent)

    const { errors, runId } = await runAdapterSync(tmpDir)

    // normal.md indexed, toobig.bin produces error
    expect(errors).toBeGreaterThanOrEqual(1)
    const run = db
      .prepare('SELECT errors_count FROM sync_runs WHERE id = ?')
      .get(runId) as { errors_count: number }
    expect(run.errors_count).toBeGreaterThanOrEqual(1)

    const items = db
      .prepare("SELECT uri FROM items WHERE source_id = 'src-ld-01'")
      .all() as { uri: string }[]
    const uris = items.map((i) => i.uri)
    expect(uris.some((u) => u.includes('normal.md'))).toBe(true)
    expect(uris.some((u) => u.includes('toobig.bin'))).toBe(false)
  })

  test('run status is completed even when errors_count > 0 (partial success)', async () => {
    await writeFile(join(tmpDir, 'ok.md'), '# OK')
    const bigContent = Buffer.alloc(3 * 1024 * 1024, 'y')
    await writeFile(join(tmpDir, 'big.bin'), bigContent)

    const { runId } = await runAdapterSync(tmpDir)

    const run = db
      .prepare('SELECT status, errors_count FROM sync_runs WHERE id = ?')
      .get(runId) as { status: string; errors_count: number }
    expect(run.status).toBe('completed')
    expect(run.errors_count).toBeGreaterThanOrEqual(1)
  })

  test('source_sync_state is updated after successful run', async () => {
    await writeFile(join(tmpDir, 'file.md'), '# File')

    const { runId } = await runAdapterSync(tmpDir)

    const state = db
      .prepare(
        "SELECT last_status, last_run_id FROM source_sync_state WHERE source_id = 'src-ld-01'",
      )
      .get() as { last_status: string; last_run_id: string }
    expect(state.last_status).toBe('idle')
    expect(state.last_run_id).toBe(runId)
  })

  test('chunker produces correct chunk structure for long text', async () => {
    // Write a file long enough to produce multiple chunks
    const longText = Array.from(
      { length: 100 },
      (_, i) =>
        `## Section ${i}\n\nContent for section ${i}. This is some text to make it longer.\n`,
    ).join('\n')
    await writeFile(join(tmpDir, 'long.md'), longText)

    const { itemsAdded, chunksAdded } = await runAdapterSync(tmpDir)

    expect(itemsAdded).toBe(1)
    expect(chunksAdded).toBeGreaterThan(1)

    const chunks = db
      .prepare(
        "SELECT chunk_index, content FROM item_chunks WHERE item_id IN (SELECT id FROM items WHERE source_id = 'src-ld-01') ORDER BY chunk_index",
      )
      .all() as { chunk_index: number; content: string }[]

    // Chunks should be in order
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.chunk_index).toBe(i)
    }
    // Each chunk content should be non-empty
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0)
    }
  })
})
