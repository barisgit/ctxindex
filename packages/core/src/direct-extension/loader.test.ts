import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultConfig } from '../config'
import { loadExtensions } from '../extension'
import type { DirectExtensionInstallationRecord } from './schema'
import { DirectExtensionStore, hashDirectory } from './store'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

test('loads a valid direct pin offline and degrades a missing pin per Extension', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-loader-'))
  roots.push(root)
  const dataRoot = join(root, 'data')
  const staging = join(root, 'staging')
  await mkdir(join(staging, 'package'), { recursive: true })
  await writeFile(
    join(staging, 'package', 'package.json'),
    JSON.stringify({ ctxindex: { extensions: ['./entry.ts'] } }),
  )
  await writeFile(
    join(staging, 'package', 'entry.ts'),
    `export default { kind: 'extension', id: 'example.direct', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`,
  )
  const digest = await hashDirectory(staging)
  const store = new DirectExtensionStore({
    configRoot: join(root, 'config'),
    dataRoot,
  })
  await store.publishMaterialization(staging, digest)
  const valid: DirectExtensionInstallationRecord = {
    id: 'example.direct',
    source: {
      kind: 'local',
      requested_target: '/deleted/original',
      origin_path: '/deleted/original',
      content_digest: digest,
    },
    materialization_digest: digest,
    package_root: 'package',
    installed_at: 1,
    updated_at: 1,
  }
  const missing: DirectExtensionInstallationRecord = {
    ...valid,
    id: 'example.missing',
    materialization_digest: 'f'.repeat(64),
  }
  const corruptStaging = join(root, 'corrupt-staging')
  await mkdir(join(corruptStaging, 'package'), { recursive: true })
  await writeFile(
    join(corruptStaging, 'package', 'package.json'),
    JSON.stringify({ ctxindex: { extensions: ['./entry.ts'] } }),
  )
  await writeFile(
    join(corruptStaging, 'package', 'entry.ts'),
    `export default { kind: 'extension', id: 'example.corrupt', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`,
  )
  const corruptDigest = await hashDirectory(corruptStaging)
  await store.publishMaterialization(corruptStaging, corruptDigest)
  await writeFile(
    join(store.materializationsRoot, corruptDigest, 'package', 'entry.ts'),
    'corrupted after publication',
  )
  const corrupt: DirectExtensionInstallationRecord = {
    ...valid,
    id: 'example.corrupt',
    materialization_digest: corruptDigest,
  }

  const loaded = await loadExtensions({
    config: defaultConfig(),
    builtins: {},
    directInstalled: [valid, missing, corrupt],
    dataRoot,
  })
  expect(loaded.registry.list().map(({ id }) => id)).toEqual(['example.direct'])
  expect(loaded.provenance).toEqual([
    expect.objectContaining({
      id: 'example.direct',
      kind: 'direct',
      sourceKind: 'local',
      materializationDigest: digest,
    }),
  ])
  expect(loaded.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: 'direct:example.missing' }),
      expect.objectContaining({ path: 'direct:example.corrupt' }),
    ]),
  )
})

test('preserves npm integrity in loaded direct provenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-direct-npm-loader-'))
  roots.push(root)
  const dataRoot = join(root, 'data')
  const staging = join(root, 'staging')
  await mkdir(join(staging, 'package'), { recursive: true })
  await writeFile(
    join(staging, 'package', 'package.json'),
    JSON.stringify({ ctxindex: { extensions: ['./entry.ts'] } }),
  )
  await writeFile(
    join(staging, 'package', 'entry.ts'),
    `export default { kind: 'extension', id: 'example.npm', providers: [], oauthApps: [], profiles: [], adapters: [] }\n`,
  )
  const digest = await hashDirectory(staging)
  const store = new DirectExtensionStore({
    configRoot: join(root, 'config'),
    dataRoot,
  })
  await store.publishMaterialization(staging, digest)
  const installed: DirectExtensionInstallationRecord = {
    id: 'example.npm',
    source: {
      kind: 'npm',
      requested_target: '@example/npm@^1',
      exact_version: '1.2.3',
      integrity: 'sha512-exact',
    },
    materialization_digest: digest,
    package_root: 'package',
    installed_at: 1,
    updated_at: 1,
  }

  const loaded = await loadExtensions({
    config: defaultConfig(),
    builtins: {},
    directInstalled: [installed],
    dataRoot,
  })

  expect(loaded.provenance).toEqual([
    expect.objectContaining({
      id: 'example.npm',
      kind: 'direct',
      sourceKind: 'npm',
      resolvedIdentity: '1.2.3 (sha512-exact)',
    }),
  ])
})
