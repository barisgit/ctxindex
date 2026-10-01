import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { SyncContext, SyncEmission } from '@ctxindex/extension-sdk'
import { fileSchema } from '@ctxindex/profiles/file'
import { localDirectoryRef } from './ref'
import { localDirectorySync } from './sync'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'

async function fixture(files: Record<string, string | Uint8Array>) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-sync-'))
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path)
    await mkdir(join(absolute, '..'), { recursive: true })
    await writeFile(absolute, content)
  }
  return root
}

async function runSync(
  root: string,
  options: {
    cursor?: unknown
    mode?: SyncContext['mode']
    sizeCapBytes?: number
    signal?: AbortSignal
  } = {},
): Promise<SyncEmission[]> {
  const emissions: SyncEmission[] = []
  await localDirectorySync({
    source: {
      id: sourceId,
      config: {
        root_path: root,
        ...(options.sizeCapBytes
          ? { size_cap_bytes: options.sizeCapBytes }
          : {}),
      },
    },
    fetch: (() => {
      throw new Error('local.directory must not use network fetch')
    }) as unknown as typeof fetch,
    logger: {
      trace() {},
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    cursor: options.cursor ?? null,
    mode: options.mode ?? 'sync',
    signal: options.signal ?? new AbortController().signal,
    emit: (emission) => {
      emissions.push(emission)
    },
  })

  return emissions
}

describe('localDirectorySync', () => {
  test('emits the exact stable Ref and complete file@1 payload', async () => {
    const text = 'hello from a nested file\n'
    const root = await fixture({ 'notes/a b%.md': text })
    const file = join(root, 'notes/a b%.md')
    const fixed = new Date('2026-07-15T12:34:56.000Z')
    await utimes(file, fixed, fixed)
    const metadata = await stat(file)

    const emissions = await runSync(root)

    expect(emissions).toHaveLength(2)
    const upsert = emissions[0]
    expect(upsert).toEqual({
      type: 'upsertResource',
      resource: {
        ref: localDirectoryRef(sourceId, 'notes/a b%.md'),
        profile: { id: 'file', version: 1 },
        completeness: 'complete',
        payload: {
          path: 'notes/a b%.md',
          name: basename(file),
          mediaType: 'text/plain',
          byteSize: Buffer.byteLength(text),
          modifiedAt: metadata.mtime.toISOString(),
          contentHash: `sha256:${createHash('sha256').update(text).digest('hex')}`,
          text,
        },
      },
    })
    if (upsert?.type === 'upsertResource') {
      expect(fileSchema.safeParse(upsert.resource.payload).success).toBe(true)
      expect(JSON.stringify(upsert)).not.toContain(root)
      expect(upsert.resource).not.toHaveProperty('title')
    }
    expect(emissions[1]).toMatchObject({
      type: 'checkpoint',
      cursor: {
        version: 1,
        files: [expect.objectContaining({ path: 'notes/a b%.md' })],
      },
    })
  })

  test('orders typed skip warnings without leaking absolute paths or contents', async () => {
    const root = await fixture({
      'a.png': Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]),
      'b.txt': 'secret-over-limit',
      'keep.txt': 'keep',
    })
    await symlink(join(root, 'keep.txt'), join(root, 'c-link'))

    const emissions = await runSync(root, { sizeCapBytes: 8 })
    const warnings = emissions.filter((value) => value.type === 'warning')

    expect(warnings.map((value) => value.code)).toEqual([
      'binary_skipped',
      'oversize_skipped',
      'symlink_skipped',
    ])
    expect(JSON.stringify(warnings)).not.toContain(root)
    expect(JSON.stringify(warnings)).not.toContain('secret-over-limit')
    expect(emissions.at(-1)?.type).toBe('checkpoint')
  })

  test('uses a deterministic strict cursor, skips unchanged, and resync emits all', async () => {
    const root = await fixture({ 'b.txt': 'b', 'a.txt': 'a' })
    const first = await runSync(root)
    const checkpoint = first.at(-1)
    expect(checkpoint?.type).toBe('checkpoint')
    if (checkpoint?.type !== 'checkpoint') throw new Error('missing checkpoint')
    expect(checkpoint.cursor).toMatchObject({
      version: 1,
      files: [{ path: 'a.txt' }, { path: 'b.txt' }],
    })

    expect(await runSync(root, { cursor: checkpoint.cursor })).toEqual([
      { type: 'checkpoint', cursor: checkpoint.cursor },
    ])
    expect(
      (await runSync(root, { cursor: checkpoint.cursor, mode: 'resync' })).map(
        (value) => value.type,
      ),
    ).toEqual(['upsertResource', 'upsertResource', 'checkpoint'])

    const invalid = await runSync(root, {
      cursor: { version: 1, files: [{ path: '/absolute' }] },
    })
    expect(invalid[0]).toEqual({
      type: 'warning',
      code: 'invalid_cursor',
      message: 'Ignored invalid local.directory cursor',
    })
    expect(invalid.filter((value) => value.type === 'removeResource')).toEqual(
      [],
    )
  })

  test('round-trips mixed-case cursor order without invalidation', async () => {
    const root = await fixture({ 'README.md': 'readme', 'index.ts': 'index' })
    const first = await runSync(root)
    const checkpoint = first.at(-1)
    if (checkpoint?.type !== 'checkpoint') throw new Error('missing checkpoint')

    expect(checkpoint.cursor).toMatchObject({
      files: [{ path: 'README.md' }, { path: 'index.ts' }],
    })
    expect(await runSync(root, { cursor: checkpoint.cursor })).toEqual([
      checkpoint,
    ])

    await rm(join(root, 'README.md'))
    const deletion = await runSync(root, { cursor: checkpoint.cursor })
    expect(deletion).not.toContainEqual(
      expect.objectContaining({ type: 'warning', code: 'invalid_cursor' }),
    )
    expect(deletion).toContainEqual({
      type: 'removeResource',
      ref: localDirectoryRef(sourceId, 'README.md'),
    })
  })

  test('rename emits old removal plus new upsert and diff has the same candidates', async () => {
    const root = await fixture({ 'old.txt': 'content' })
    const initial = await runSync(root)
    const checkpoint = initial.at(-1)
    if (checkpoint?.type !== 'checkpoint') throw new Error('missing checkpoint')
    await rename(join(root, 'old.txt'), join(root, 'new.txt'))

    const sync = await runSync(root, { cursor: checkpoint.cursor })
    const diff = await runSync(root, {
      cursor: checkpoint.cursor,
      mode: 'diff',
    })

    expect(diff).toEqual(sync)
    expect(sync.map((value) => value.type)).toEqual([
      'upsertResource',
      'removeResource',
      'checkpoint',
    ])
    expect(sync[1]).toEqual({
      type: 'removeResource',
      ref: localDirectoryRef(sourceId, 'old.txt'),
    })
  })

  test('transient incomplete traversal carries prior records instead of tombstoning', async () => {
    const root = await fixture({ 'prior.txt': 'content' })
    const initial = await runSync(root)
    const checkpoint = initial.at(-1)
    if (checkpoint?.type !== 'checkpoint') throw new Error('missing checkpoint')
    await rm(join(root, 'prior.txt'))
    await mkdir(join(root, '.gitignore'))

    const incomplete = await runSync(root, { cursor: checkpoint.cursor })

    expect(incomplete.some((value) => value.type === 'removeResource')).toBe(
      false,
    )
    expect(incomplete).toContainEqual(
      expect.objectContaining({ type: 'warning', code: 'ignore_read_failed' }),
    )
    expect(incomplete.at(-1)).toEqual(checkpoint)

    await rm(join(root, '.gitignore'), { recursive: true })
    expect(await runSync(root, { cursor: checkpoint.cursor })).toContainEqual({
      type: 'removeResource',
      ref: localDirectoryRef(sourceId, 'prior.txt'),
    })
  })
})
