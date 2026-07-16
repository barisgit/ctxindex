import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuthService } from '@ctxindex/core/auth'
import type { Logger } from '@ctxindex/core/logger'
import { createRealmService } from '@ctxindex/core/realm'
import { createExtensionRegistry } from '@ctxindex/core/registry'
import { createSourceService, syncSource } from '@ctxindex/core/source'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { CTXINDEX_BUILTIN_EXTENSIONS } from '../index'
import { localDirectoryRef } from './ref'

const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('local.directory must not resolve auth')
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const dbs: Database[] = []

afterEach(() => {
  for (const db of dbs.splice(0)) db.close()
})

describe('local.directory built-in service integration', () => {
  test('syncSource materializes generic file resources and reconciles updates and renames', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-local-integration-'))
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, '.gitignore'), '*.ignored\n')
    await writeFile(
      join(root, 'nested', 'code.ts'),
      'export const answer = 42\n',
    )
    await writeFile(join(root, 'hidden.ignored'), 'must not index')
    await writeFile(
      join(root, 'binary.png'),
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    await writeFile(join(root, 'oversize.txt'), 'x'.repeat(128))
    await symlink(join(root, 'nested', 'code.ts'), join(root, 'linked.ts'))

    const db = new Database(':memory:')
    dbs.push(db)
    applyPragmas(db)
    await runMigrations(db)
    const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
    const realmService = createRealmService({ db, logger })
    realmService.createRealm({ slug: 'work' })
    const sourceService = createSourceService({
      db,
      logger,
      registry,
      realmService,
    })
    const { sourceId } = sourceService.addSource({
      adapterId: 'local.directory',
      realmSlug: 'work',
      configJson: JSON.stringify({ root_path: root, size_cap_bytes: 64 }),
    })
    let fetchCalled = false
    const run = (mode: 'sync' | 'resync' | 'diff' = 'sync') =>
      syncSource({
        db,
        registry,
        authService,
        logger,
        sourceId,
        mode,
        signal: new AbortController().signal,
        fetch: async () => {
          fetchCalled = true
          throw new Error('network fetch is forbidden')
        },
      })

    const first = await run()
    expect(first).toMatchObject({
      added: 1,
      updated: 0,
      deleted: 0,
      errorsCount: 3,
    })
    expect(first.warnings).toHaveLength(3)
    expect(fetchCalled).toBe(false)
    const ref = localDirectoryRef(sourceId, 'nested/code.ts')
    const resource = db
      .prepare(
        'SELECT ref, title, profile_id, profile_version, origin, payload_json, deleted_at FROM resources WHERE ref = ?',
      )
      .get(ref) as Record<string, unknown>
    expect(resource).toMatchObject({
      ref,
      title: 'nested/code.ts',
      profile_id: 'file',
      profile_version: 1,
      origin: 'synced',
      deleted_at: null,
    })
    expect(JSON.parse(resource.payload_json as string)).toMatchObject({
      path: 'nested/code.ts',
      name: 'code.ts',
      mediaType: 'text/plain',
      text: 'export const answer = 42\n',
    })
    expect(db.prepare('SELECT content FROM chunks').all()).toEqual([
      { content: 'export const answer = 42' },
    ])
    expect(
      db
        .prepare('SELECT field FROM field_index ORDER BY field')
        .all()
        .map((row) => (row as { field: string }).field),
    ).toEqual([
      'contentHash',
      'extension',
      'mediaType',
      'modifiedAt',
      'name',
      'path',
      'size',
    ])
    expect(
      db
        .prepare(
          'SELECT status, errors_count FROM sync_runs ORDER BY started_at DESC LIMIT 1',
        )
        .get(),
    ).toEqual({ status: 'completed', errors_count: 3 })
    expect(
      db.prepare('SELECT ref FROM resources WHERE ref LIKE ?').all('%ignored%'),
    ).toEqual([])
    const tableNames = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
    expect(tableNames.some((name) => name.startsWith('local_directory'))).toBe(
      false,
    )
    expect(
      tableNames.some((name) =>
        ['files', 'emails', 'messages', 'gmail'].includes(name),
      ),
    ).toBe(false)

    expect(await run()).toMatchObject({ added: 0, updated: 0, deleted: 0 })

    await writeFile(
      join(root, 'nested', 'code.ts'),
      'export const answer = 43\n',
    )
    expect(await run()).toMatchObject({ added: 0, updated: 1, deleted: 0 })
    expect(
      db
        .prepare('SELECT ref, deleted_at FROM resources WHERE ref = ?')
        .get(ref),
    ).toEqual({ ref, deleted_at: null })

    await rename(
      join(root, 'nested', 'code.ts'),
      join(root, 'nested', 'renamed.ts'),
    )
    expect(await run()).toMatchObject({ added: 1, updated: 0, deleted: 1 })
    expect(
      db.prepare('SELECT deleted_at FROM resources WHERE ref = ?').get(ref),
    ).toEqual({ deleted_at: expect.any(Number) })
    const renamedRef = localDirectoryRef(sourceId, 'nested/renamed.ts')
    expect(
      db
        .prepare('SELECT deleted_at FROM resources WHERE ref = ?')
        .get(renamedRef),
    ).toEqual({ deleted_at: null })

    await rm(join(root, 'nested', 'renamed.ts'))
    await mkdir(join(root, '.ctxindexignore'))
    expect(await run()).toMatchObject({ deleted: 0 })
    expect(
      db
        .prepare('SELECT deleted_at FROM resources WHERE ref = ?')
        .get(renamedRef),
    ).toEqual({ deleted_at: null })

    await rm(join(root, '.ctxindexignore'), { recursive: true })
    expect(await run()).toMatchObject({ deleted: 1 })
    expect(
      db
        .prepare('SELECT deleted_at FROM resources WHERE ref = ?')
        .get(renamedRef),
    ).toEqual({ deleted_at: expect.any(Number) })
  })
})
