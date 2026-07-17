import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import { ArtifactStore } from './artifact-store'

const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const originRef = `ctx://${sourceId}/messages/one`
const artifactRef = `${originRef}/attachments/file`
const expectedHex =
  'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(options: { purgeId?: () => string } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-artifacts-'))
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
  db.exec(`
    INSERT INTO realms (id, slug, created_at) VALUES ('realm', 'test', 1);
    INSERT INTO sources (
      id, realm_id, label, adapter_id, adapter_version, config_json, created_at, updated_at
    ) VALUES (
      '${sourceId}', 'realm', 'Artifact Store Source', 'fake', 1, '{}', 1, 1
    );
    INSERT INTO resources (
      id, ref, source_id, realm_id, profile_id, profile_version, origin,
      created_at, updated_at
    ) VALUES (
      'resource', '${originRef}', '${sourceId}', 'realm', 'fake.record', 1,
      'synced', 1, 1
    );
  `)
  cleanups.push(
    () => db.close(),
    () => rm(root, { recursive: true, force: true }),
  )
  return {
    db,
    root,
    store: new ArtifactStore(db, {
      root,
      clock: () => 123,
      ...options,
    }),
  }
}

async function writeArtifact(store: ArtifactStore, ref: string, bytes: string) {
  const writer = await store.createWriter()
  await writer.write(new TextEncoder().encode(bytes))
  return writer.commit({
    ref,
    originRef,
    mediaType: 'text/plain',
    retentionClass: 'cached',
  })
}

test('streams bytes into the managed CAS before recording metadata', async () => {
  const { db, root, store } = await fixture()
  const writer = await store.createWriter()
  await writer.write(new TextEncoder().encode('hello '))
  await writer.write(new TextEncoder().encode('world'))

  const artifact = await writer.commit({
    ref: artifactRef,
    originRef,
    mediaType: 'text/plain',
    retentionClass: 'cached',
  })

  const relativePath = `sha256/${expectedHex.slice(0, 2)}/${expectedHex}`
  expect(artifact).toEqual({
    ref: artifactRef,
    originRef,
    contentHash: `sha256:${expectedHex}`,
    mediaType: 'text/plain',
    byteSize: 11,
    retentionClass: 'cached',
    localPath: relativePath,
    createdAt: 123,
  })
  expect(await store.get(artifactRef)).toEqual(artifact)
  expect(await readFile(join(root, relativePath), 'utf8')).toBe('hello world')
  expect((await stat(join(root, relativePath))).mode & 0o777).toBe(0o600)
  expect(db.prepare('SELECT * FROM artifacts').get()).toMatchObject({
    ref: artifactRef,
    resource_id: 'resource',
    origin_ref: originRef,
    content_hash: `sha256:${expectedHex}`,
    byte_size: 11,
    local_path: relativePath,
  })
})

test('a filesystem failure after metadata deletion leaves safe orphan bytes for the next purge', async () => {
  const purgeId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
  const { db, root, store } = await fixture({ purgeId: () => purgeId })
  const artifact = await writeArtifact(store, artifactRef, 'stored')
  const collision = join(root, `.purge-${purgeId}-sha256`)
  await mkdir(collision)
  await writeFile(join(collision, 'stale'), 'stale')

  await expect(store.purge()).rejects.toMatchObject({ code: 'data_integrity' })
  expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({
    count: 0,
  })
  expect(await store.get(artifactRef)).toBeUndefined()
  expect(await readFile(join(root, artifact.localPath), 'utf8')).toBe('stored')

  const recovery = new ArtifactStore(db, {
    root,
    purgeId: () => '01BX5ZZKBKACTAV9WEVGEMMVRZ',
  } as never)
  expect(await recovery.purge()).toMatchObject({
    artifactCountRemoved: 0,
    objectCountRemoved: 2,
    logicalBytesFreed: 0,
    physicalBytesFreed: 11,
  })
  expect(await readdir(root)).not.toContain('sha256')
  expect(await readdir(root)).not.toContain(`.purge-${purgeId}-sha256`)
})

test('purge reclaims only strict regular stale quarantine entries', async () => {
  const { root, store } = await fixture()
  const staleHash = '.purge-01ARZ3NDEKTSV4RRFFQ69G5FAV-sha256'
  const staleTemp = '.purge-01BX5ZZKBKACTAV9WEVGEMMVRZ-tmp'
  await mkdir(join(root, staleHash))
  await writeFile(join(root, staleHash, 'object'), 'orphan')
  await mkdir(join(root, staleTemp))
  await writeFile(join(root, staleTemp, 'temp'), 'partial')

  const unrelated = join(root, 'unrelated')
  const lookalike = join(root, '.purge-not-a-ulid-sha256')
  const wrongSuffix = join(root, '.purge-01KXHBNECDAH1T4MJ38X88EPFJ-other')
  await mkdir(unrelated)
  await mkdir(lookalike)
  await mkdir(wrongSuffix)
  await writeFile(join(unrelated, 'keep'), 'keep')
  const linked = join(root, '.purge-01KXHBNECDAH1T4MJ38X88EPFJ-sha256')
  await symlink(unrelated, linked)

  expect(await store.purge()).toMatchObject({
    objectCountRemoved: 2,
    physicalBytesFreed: 13,
  })
  const remaining = await readdir(root)
  expect(remaining).not.toContain(staleHash)
  expect(remaining).not.toContain(staleTemp)
  expect(remaining).toEqual(
    expect.arrayContaining([
      'unrelated',
      '.purge-not-a-ulid-sha256',
      '.purge-01KXHBNECDAH1T4MJ38X88EPFJ-other',
      '.purge-01KXHBNECDAH1T4MJ38X88EPFJ-sha256',
    ]),
  )
  expect(await readFile(join(unrelated, 'keep'), 'utf8')).toBe('keep')
  expect((await lstat(linked)).isSymbolicLink()).toBe(true)
})

test('concurrent equal writes to one Artifact Ref are idempotent', async () => {
  const { db, store } = await fixture()
  const [first, second] = await Promise.all([
    writeArtifact(store, artifactRef, 'same bytes'),
    writeArtifact(store, artifactRef, 'same bytes'),
  ])

  expect(second).toEqual(first)
  expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({
    count: 1,
  })
  expect(await store.diskAccounting()).toEqual({
    artifactCount: 1,
    objectCount: 1,
    logicalBytes: 10,
    physicalBytes: 10,
  })
})

test('deduplicates equal bytes while accounting for logical and physical size', async () => {
  const { store } = await fixture()
  await writeArtifact(store, artifactRef, 'hello world')
  await writeArtifact(store, `${originRef}/attachments/other`, 'hello world')

  expect(await store.diskAccounting()).toEqual({
    artifactCount: 2,
    objectCount: 1,
    logicalBytes: 22,
    physicalBytes: 11,
  })
})

async function tempEntries(root: string): Promise<string[]> {
  try {
    return await readdir(join(root, '.tmp'))
  } catch {
    return []
  }
}

test('concurrent equal writes install one CAS object', async () => {
  const { store } = await fixture()
  await Promise.all([
    writeArtifact(store, artifactRef, 'same bytes'),
    writeArtifact(store, `${originRef}/attachments/concurrent`, 'same bytes'),
  ])

  expect(await store.diskAccounting()).toEqual({
    artifactCount: 2,
    objectCount: 1,
    logicalBytes: 20,
    physicalBytes: 10,
  })
})

test('abort and producer failure leave no metadata or temporary files', async () => {
  const { db, root, store } = await fixture()
  const writer = await store.createWriter()
  await writer.write(new TextEncoder().encode('partial'))
  await writer.abort()

  await expect(
    store.write(
      {
        ref: artifactRef,
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'cached',
      },
      async (sink) => {
        await sink.write(new TextEncoder().encode('partial'))
        throw new Error('producer failed')
      },
    ),
  ).rejects.toThrow('producer failed')
  expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({
    count: 0,
  })
  expect(await tempEntries(root)).toEqual([])
})

test('rejects missing owners and invalid Artifact Ref metadata', async () => {
  const { db, root, store } = await fixture()
  const cases = [
    {
      metadata: {
        ref: `ctx://${sourceId}/missing/attachments/file`,
        originRef: `ctx://${sourceId}/missing`,
        mediaType: 'text/plain',
        retentionClass: 'cached' as const,
      },
      code: 'not_found',
    },
    {
      metadata: {
        ref: 'ctx://01BX5ZZKBKACTAV9WEVGEMMVRZ/messages/one/attachment',
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'cached' as const,
      },
      code: 'ref_source_mismatch',
    },
    {
      metadata: {
        ref: `${originRef}/`,
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'cached' as const,
      },
      code: 'invalid_artifact_ref',
    },
    {
      metadata: {
        ref: originRef,
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'cached' as const,
      },
      code: 'invalid_artifact_ref',
    },
    {
      metadata: {
        ref: `ctx://${sourceId}/messages/another/attachment`,
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'cached' as const,
      },
      code: 'invalid_artifact_ref',
    },
    {
      metadata: {
        ref: artifactRef,
        originRef,
        mediaType: 'text/plain',
        retentionClass: 'ephemeral' as 'cached',
      },
      code: 'invalid_artifact_retention',
    },
  ]

  for (const entry of cases) {
    const writer = await store.createWriter()
    await writer.write(new TextEncoder().encode('bytes'))
    await expect(writer.commit(entry.metadata)).rejects.toMatchObject({
      code: entry.code,
    })
  }
  expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({
    count: 0,
  })
  expect(await tempEntries(root)).toEqual([])
})

test('same Artifact Ref is idempotent but cannot be rebound', async () => {
  const { store } = await fixture()
  const first = await writeArtifact(store, artifactRef, 'stable')
  const second = await writeArtifact(store, artifactRef, 'stable')
  expect(second).toEqual(first)

  await expect(
    writeArtifact(store, artifactRef, 'changed'),
  ).rejects.toMatchObject({
    code: 'data_integrity',
  })
  expect(await store.diskAccounting()).toEqual({
    artifactCount: 1,
    objectCount: 1,
    logicalBytes: 6,
    physicalBytes: 6,
  })
})

test('detects a corrupt existing CAS object before reuse or cache lookup', async () => {
  const { root, store } = await fixture()
  const artifact = await writeArtifact(store, artifactRef, 'hello world')
  await writeFile(join(root, artifact.localPath), 'corrupt data', {
    mode: 0o600,
  })

  await expect(store.get(artifactRef)).rejects.toMatchObject({
    code: 'data_integrity',
  })
  await expect(
    writeArtifact(store, `${originRef}/attachments/reuse`, 'hello world'),
  ).rejects.toMatchObject({ code: 'data_integrity' })
})

test('disk accounting includes actual orphan CAS objects', async () => {
  const { root, store } = await fixture()
  await writeArtifact(store, artifactRef, 'stored')
  const orphanHash = 'a'.repeat(64)
  const orphanDir = join(root, 'sha256', 'aa')
  await mkdir(orphanDir, { recursive: true })
  await writeFile(join(orphanDir, orphanHash), 'orphan', { mode: 0o600 })

  expect(await store.diskAccounting()).toEqual({
    artifactCount: 1,
    objectCount: 2,
    logicalBytes: 6,
    physicalBytes: 12,
  })
})

test('purge removes metadata, deduplicated and orphan bytes, and abandoned temp data', async () => {
  const { db, root, store } = await fixture()
  db.prepare(`INSERT INTO relations
    (id, source_resource_id, relation, target_ref, created_at)
    VALUES ('relation', 'resource', 'related', ?, 1)`).run(originRef)
  await writeArtifact(store, artifactRef, 'stored')
  await writeArtifact(store, `${originRef}/attachments/other`, 'stored')
  const orphanDir = join(root, 'sha256', 'aa')
  await mkdir(orphanDir, { recursive: true })
  await writeFile(join(orphanDir, 'a'.repeat(64)), 'orphan')
  const abandonedTemp = join(root, '.tmp', 'write-abandoned')
  await mkdir(abandonedTemp, { recursive: true })
  await writeFile(join(abandonedTemp, 'content'), 'partial')

  expect(await store.purge()).toEqual({
    artifactCountRemoved: 2,
    objectCountRemoved: 3,
    logicalBytesFreed: 12,
    physicalBytesFreed: 19,
    diskAccounting: {
      artifactCount: 0,
      objectCount: 0,
      logicalBytes: 0,
      physicalBytes: 0,
    },
  })
  expect(db.prepare('SELECT COUNT(*) AS count FROM artifacts').get()).toEqual({
    count: 0,
  })
  expect(db.prepare('SELECT ref FROM resources').get()).toEqual({
    ref: originRef,
  })
  expect(db.prepare('SELECT COUNT(*) AS count FROM relations').get()).toEqual({
    count: 1,
  })
  expect(db.prepare('SELECT COUNT(*) AS count FROM sources').get()).toEqual({
    count: 1,
  })
  expect(await tempEntries(root)).toEqual([])
  expect(await store.purge()).toEqual({
    artifactCountRemoved: 0,
    objectCountRemoved: 0,
    logicalBytesFreed: 0,
    physicalBytesFreed: 0,
    diskAccounting: {
      artifactCount: 0,
      objectCount: 0,
      logicalBytes: 0,
      physicalBytes: 0,
    },
  })
})

test('purge leaves bytes untouched when deleting metadata fails', async () => {
  const { db, store } = await fixture()
  await writeArtifact(store, artifactRef, 'stored')
  db.exec(`CREATE TRIGGER reject_artifact_delete
    BEFORE DELETE ON artifacts
    BEGIN
      SELECT RAISE(ABORT, 'reject purge');
    END`)

  await expect(store.purge()).rejects.toMatchObject({ code: 'data_integrity' })
  expect(await store.get(artifactRef)).toBeDefined()
  expect(await store.diskAccounting()).toEqual({
    artifactCount: 1,
    objectCount: 1,
    logicalBytes: 6,
    physicalBytes: 6,
  })
})

test('purge removes only fixed managed subtrees without following symlinks', async () => {
  const { root, store } = await fixture()
  const outside = join(root, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'keep'), 'keep')
  await symlink(outside, join(root, 'sha256'))

  expect(await store.purge()).toMatchObject({
    artifactCountRemoved: 0,
    objectCountRemoved: 0,
  })
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('keep')
  expect((await stat(root)).isDirectory()).toBe(true)
})

test('a tombstoned origin Resource still owns Artifact metadata', async () => {
  const { db, store } = await fixture()
  db.prepare('UPDATE resources SET deleted_at = 99 WHERE ref = ?').run(
    originRef,
  )

  expect(await writeArtifact(store, artifactRef, 'cached')).toMatchObject({
    ref: artifactRef,
    originRef,
  })
})
