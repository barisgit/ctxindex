import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  type DownloadContext,
  defineAdapter,
  defineExtension,
  defineProfile,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import {
  CtxindexError,
  CtxindexNotFoundError,
  CtxindexValidationError,
} from '../errors'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas } from '../storage'
import { runMigrations } from '../storage/migrator'
import { ArtifactService } from './artifact-service'
import { ArtifactStore } from './artifact-store'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'
const originRef = `ctx://${sourceId}/message/one`
const artifactRef = `${originRef}/attachment/file`
const bytes = Buffer.from('artifact bytes')
const logger = { trace() {}, debug() {}, info() {}, warn() {}, error() {} }
const authService = {
  async resolveLinkedGrantAccessToken() {
    throw new Error('not used')
  },
} as Pick<AuthService, 'resolveLinkedGrantAccessToken'>
const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture(
  options: {
    declaredSize?: number
    fail?: Error
    download?: boolean
    downloadStarted?: () => void
    waitForDownload?: Promise<void>
    purgeId?: () => string
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-artifact-service-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const db = new Database(':memory:')
  cleanups.push(() => db.close())
  applyPragmas(db)
  await runMigrations(db)
  db.exec(
    "INSERT INTO realms (id, slug, label, created_at) VALUES ('realm', 'work', 'Work', 1)",
  )
  db.prepare(`INSERT INTO sources
    (id, realm_id, label, adapter_id, config_json, sync_enabled, created_at, updated_at)
    VALUES (?, 'realm', 'Artifact Service Source', 'fake.artifacts', '{}', 1, 1, 1)`).run(
    sourceId,
  )

  let calls = 0
  const profile = defineProfile({
    id: 'fake.message',
    version: 1,
    schema: z.object({ attachments: z.array(z.object({ ref: z.string() })) }),
    artifacts: (payload) =>
      payload.attachments.map((artifact) => ({
        ...artifact,
        filename: 'file.bin',
        mediaType: 'application/octet-stream',
        ...(options.declaredSize === undefined
          ? {}
          : { byteSize: options.declaredSize }),
      })),
  })
  const common = {
    id: 'fake.artifacts',
    configSchema: z.object({}).strict(),
    profiles: [profile],
    routing: 'indexed' as const,
    actions: {},
  }
  const download = async (context: DownloadContext) => {
    calls += 1
    options.downloadStarted?.()
    await options.waitForDownload
    await context.write(bytes.subarray(0, 4))
    if (options.fail) throw options.fail
    await context.write(bytes.subarray(4))
  }
  const adapter =
    options.download === false
      ? defineAdapter({ ...common, capabilities: [], operations: {} })
      : defineAdapter({
          ...common,
          capabilities: ['download'],
          operations: { download },
        })
  const registry = createExtensionRegistry([
    defineExtension({
      id: 'fake.artifacts-extension',
      profiles: [profile],
      adapters: [adapter],
    }),
  ])
  new ResourceStore(db, registry.profiles).upsert({
    ref: originRef,
    sourceId,
    profile: { id: 'fake.message', version: 1 },
    origin: 'synced',
    completeness: 'complete',
    payload: { attachments: [{ ref: artifactRef }] },
  })
  const store = new ArtifactStore(db, {
    root: join(root, 'store'),
    ...(options.purgeId ? { purgeId: options.purgeId } : {}),
  })
  const service = new ArtifactService({
    db,
    registry,
    authService,
    logger,
    store,
  })
  return { db, root, store, service, calls: () => calls }
}

describe('ArtifactService', () => {
  test('resolves only current same-Source verified cached bytes for Actions', async () => {
    const f = await fixture({ declaredSize: bytes.length })
    expect(await f.service.resolveCached(artifactRef, sourceId)).toBeNull()
    await f.service.download(artifactRef)
    const first = await f.service.resolveCached(artifactRef, sourceId)
    expect(first).toEqual({
      ref: artifactRef,
      originRef,
      filename: 'file.bin',
      mediaType: 'application/octet-stream',
      byteSize: bytes.length,
      bytes: new Uint8Array(bytes),
    })
    if (!first) throw new Error('expected cached Artifact')
    first.bytes[0] = 255
    expect(
      (await f.service.resolveCached(artifactRef, sourceId))?.bytes,
    ).toEqual(new Uint8Array(bytes))
    expect(f.calls()).toBe(1)
    await expect(
      f.service.resolveCached(artifactRef, sourceId, bytes.length - 1),
    ).rejects.toMatchObject({ code: 'invalid_action_input' })

    await expect(
      f.service.resolveCached(
        artifactRef.replace(sourceId, '01KXHBNECDAH1T4MJ38X88EPFK'),
        sourceId,
      ),
    ).rejects.toMatchObject({ code: 'ref_source_mismatch' })
    f.db
      .prepare('UPDATE resources SET hydrated_at = NULL WHERE ref = ?')
      .run(originRef)
    expect(await f.service.resolveCached(artifactRef, sourceId)).toBeNull()
    f.db
      .prepare('UPDATE resources SET hydrated_at = 1 WHERE ref = ?')
      .run(originRef)
    f.db
      .prepare('UPDATE resources SET payload_json = ? WHERE ref = ?')
      .run(JSON.stringify({ attachments: [] }), originRef)
    expect(await f.service.resolveCached(artifactRef, sourceId)).toBeNull()
    expect(f.calls()).toBe(1)
  })

  test('rejects cached metadata drift and returns unavailable after purge', async () => {
    const f = await fixture({ declaredSize: bytes.length })
    await f.service.download(artifactRef)
    f.db
      .prepare('UPDATE artifacts SET media_type = ? WHERE ref = ?')
      .run('text/plain', artifactRef)
    await expect(
      f.service.resolveCached(artifactRef, sourceId),
    ).rejects.toMatchObject({ code: 'data_integrity' })
    f.db
      .prepare('UPDATE artifacts SET media_type = ? WHERE ref = ?')
      .run('application/octet-stream', artifactRef)
    await f.service.purge()
    expect(await f.service.resolveCached(artifactRef, sourceId)).toBeNull()
    expect(f.calls()).toBe(1)
  })

  test('lists exact live Resource Profile descriptors without provider I/O', async () => {
    const f = await fixture()
    expect(await f.service.list(originRef)).toEqual({
      resourceRef: originRef,
      artifacts: [
        {
          ref: artifactRef,
          filename: 'file.bin',
          mediaType: 'application/octet-stream',
        },
      ],
      warnings: [],
    })
    expect(f.calls()).toBe(0)
    await expect(f.service.list(`${originRef}/missing`)).rejects.toBeInstanceOf(
      CtxindexNotFoundError,
    )
  })

  test('list, accounting, and download never evict even old cached bytes', async () => {
    const f = await fixture({ declaredSize: bytes.length })
    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'miss',
      artifact: { ref: artifactRef, byteSize: bytes.length },
    })
    expect(f.calls()).toBe(1)
    f.db.prepare('UPDATE artifacts SET created_at = 1').run()
    await f.service.list(originRef)
    await f.store.diskAccounting()
    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'hit',
      artifact: { ref: artifactRef },
    })
    expect(f.calls()).toBe(1)
  })

  test('purge preserves the owning Resource descriptor and a later download refetches', async () => {
    const f = await fixture({ declaredSize: bytes.length })
    const listed = await f.service.list(originRef)
    await f.service.download(artifactRef)

    expect(await f.service.purge()).toMatchObject({
      artifactCountRemoved: 1,
      objectCountRemoved: 1,
      logicalBytesFreed: bytes.length,
      physicalBytesFreed: bytes.length,
      diskAccounting: { artifactCount: 0, objectCount: 0 },
    })
    expect(await f.service.list(originRef)).toEqual(listed)
    expect(
      f.db
        .prepare('SELECT payload_json FROM resources WHERE ref = ?')
        .get(originRef),
    ).toEqual({
      payload_json: JSON.stringify({ attachments: [{ ref: artifactRef }] }),
    })
    expect(f.db.prepare('SELECT COUNT(*) AS count FROM sources').get()).toEqual(
      {
        count: 1,
      },
    )

    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'miss',
    })
    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'hit',
    })
    expect(f.calls()).toBe(2)
  })

  test('download self-heals metadata after purge filesystem failure', async () => {
    const purgeId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    const f = await fixture({ purgeId: () => purgeId })
    const listed = await f.service.list(originRef)
    await f.service.download(artifactRef)
    const collision = join(f.root, 'store', `.purge-${purgeId}-sha256`)
    await mkdir(collision, { recursive: true })
    await writeFile(join(collision, 'stale'), 'stale')

    await expect(f.service.purge()).rejects.toMatchObject({
      code: 'data_integrity',
    })
    expect(await f.store.get(artifactRef)).toBeUndefined()
    expect(await f.service.list(originRef)).toEqual(listed)
    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'miss',
    })
    expect(await f.service.download(artifactRef)).toMatchObject({
      cache: 'hit',
    })
    expect(f.calls()).toBe(2)
  })

  test('aborts without metadata, temp, or CAS object on failure and declared-size mismatch', async () => {
    for (const options of [
      { fail: new Error('boom') },
      { declaredSize: bytes.length + 1 },
    ]) {
      const f = await fixture(options)
      await expect(f.service.download(artifactRef)).rejects.toBeDefined()
      expect(await f.store.get(artifactRef)).toBeUndefined()
      expect(await f.store.diskAccounting()).toEqual({
        artifactCount: 0,
        objectCount: 0,
        logicalBytes: 0,
        physicalBytes: 0,
      })
    }
  })

  test('deduplicates concurrent same-Ref misses', async () => {
    const f = await fixture()
    const results = await Promise.all([
      f.service.download(artifactRef),
      f.service.download(artifactRef),
    ])
    expect(results.map((result) => result.cache)).toEqual(['miss', 'miss'])
    expect(f.calls()).toBe(1)
  })

  test('rejects same-process purge while a download is in flight', async () => {
    let releaseDownload = () => {}
    const waitForDownload = new Promise<void>((resolve) => {
      releaseDownload = resolve
    })
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const f = await fixture({
      downloadStarted: markStarted,
      waitForDownload,
    })
    const download = f.service.download(artifactRef)
    await started

    await expect(f.service.purge()).rejects.toMatchObject({ code: 'conflict' })
    releaseDownload()
    await download
  })

  test('copies verified bytes atomically without transferring store ownership', async () => {
    const f = await fixture()
    const output = join(f.root, 'output.bin')
    const result = await f.service.download(artifactRef, { outputPath: output })
    expect(result.outputPath).toBe(output)
    expect(await readFile(output)).toEqual(bytes)
    expect((await stat(output)).mode & 0o777).toBe(0o600)
    expect(await f.store.get(artifactRef)).toBeDefined()

    await writeFile(join(f.root, 'existing.bin'), 'keep')
    await expect(
      f.service.download(artifactRef, {
        outputPath: join(f.root, 'existing.bin'),
      }),
    ).rejects.toMatchObject({ code: 'output_exists' })
    expect(await readFile(join(f.root, 'existing.bin'), 'utf8')).toBe('keep')
    expect(await f.store.get(artifactRef)).toBeDefined()
  })

  test('rejects invalid, duplicate, cross-source, unowned, and unsupported descriptors', async () => {
    const f = await fixture({ download: false })
    await expect(f.service.download(artifactRef)).rejects.toBeInstanceOf(
      CtxindexError,
    )
    await expect(
      f.service.download(`${originRef}/attachment/missing`),
    ).rejects.toBeInstanceOf(CtxindexNotFoundError)

    const badProfile = defineProfile({
      id: 'bad',
      version: 1,
      schema: z.object({}),
      artifacts: () =>
        [{ ref: artifactRef }, { ref: artifactRef, byteSize: -1 }] as never,
    })
    const registry = createExtensionRegistry([
      defineExtension({
        id: 'bad-ext',
        profiles: [badProfile],
        adapters: [],
      }),
    ])
    f.db
      .prepare(
        "UPDATE resources SET profile_id = 'bad', payload_json = '{}' WHERE ref = ?",
      )
      .run(originRef)
    const service = new ArtifactService({
      db: f.db,
      registry,
      authService,
      logger,
      store: f.store,
    })
    await expect(service.list(originRef)).rejects.toBeInstanceOf(
      CtxindexValidationError,
    )
  })
})
