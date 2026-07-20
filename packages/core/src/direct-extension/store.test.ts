import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  type DirectExtensionInstallationRecord,
  directExtensionDocumentSchema,
} from './schema'
import {
  DirectExtensionStore,
  directExtensionMaterializationPath,
  hashDirectory,
} from './store'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

function record(digest = 'a'.repeat(64)): DirectExtensionInstallationRecord {
  return {
    id: 'example.mail',
    source: {
      kind: 'npm',
      requested_target: '@example/mail@^2',
      exact_version: '2.3.4',
      integrity: 'sha512-safe',
    },
    materialization_digest: digest,
    package_root: 'node_modules/@example/mail',
    installed_at: 10,
    updated_at: 20,
  }
}

describe('direct Extension records', () => {
  test('strictly parses versioned credential-free records', () => {
    const parsed = directExtensionDocumentSchema.parse({
      schema_version: 1,
      extensions: [record()],
    })
    expect(parsed.extensions[0]).toEqual(record())
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [{ ...record(), managed_path: '/private/state' }],
      }),
    ).toThrow()
    expect(() =>
      directExtensionDocumentSchema.parse({
        schema_version: 1,
        extensions: [
          {
            ...record(),
            source: {
              ...record().source,
              requested_target: 'https://user:secret@example.com/pkg.tgz',
            },
          },
        ],
      }),
    ).toThrow()
  })

  test('derives managed paths from a digest without persisting them', () => {
    const path = directExtensionMaterializationPath('/data', 'b'.repeat(64))
    expect(path).toBe(
      join('/data', 'direct-extensions', 'materializations', 'b'.repeat(64)),
    )
    expect(isAbsolute(record().package_root)).toBe(false)
  })

  test('hashes directory contents deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-hash-'))
    roots.push(root)
    await mkdir(join(root, 'nested'))
    await writeFile(join(root, 'b.txt'), 'two')
    await writeFile(join(root, 'nested', 'a.txt'), 'one')
    const first = await hashDirectory(root)
    const second = await hashDirectory(root)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toBe(first)
  })

  test('publishes immutably, replaces records atomically, and retains referenced materializations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-store-'))
    roots.push(root)
    const configRoot = join(root, 'config')
    const dataRoot = join(root, 'data')
    const store = new DirectExtensionStore({ configRoot, dataRoot })
    const staging = join(root, 'staging')
    await mkdir(staging)
    await writeFile(join(staging, 'index.ts'), 'export default 1')
    const digest = await hashDirectory(staging)
    const installed = record(digest)

    await Promise.all([
      store.publishMaterialization(staging, digest),
      store.publishMaterialization(staging, digest),
    ])
    await store.writeRecords([installed])
    expect(await store.readRecords()).toEqual([installed])
    expect(
      await readFile(
        join(directExtensionMaterializationPath(dataRoot, digest), 'index.ts'),
        'utf8',
      ),
    ).toBe('export default 1')

    await store.collectUnreferencedMaterializations()
    expect(
      await Bun.file(
        join(directExtensionMaterializationPath(dataRoot, digest), 'index.ts'),
      ).exists(),
    ).toBe(true)
  })
})
