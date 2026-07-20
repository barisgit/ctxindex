import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import {
  importPackageEntries,
  resolvePackageEntries,
} from '@ctxindex/core/extension'
import extension, {
  tenderAdapter,
  tenderProfile,
  tenderSchema,
} from './extension'

const extensionPath = resolve(import.meta.dir, 'extension.ts')

describe('external tenders Extension proof', () => {
  test('exports ordinary SDK values with a providerless Adapter', () => {
    expect(extension).toMatchObject({
      kind: 'extension',
      id: 'enarocanje.proof',
      adapters: [tenderAdapter],
    })
    expect(extension).not.toHaveProperty('version')
    expect(extension).not.toHaveProperty('dependencies')
    expect(tenderAdapter).toMatchObject({
      kind: 'adapter',
      id: 'enarocanje.fixture',
      profiles: [tenderProfile],
    })
    expect(tenderAdapter).not.toHaveProperty('version')
    expect(tenderAdapter).not.toHaveProperty('provider')
    expect(tenderAdapter).not.toHaveProperty('access')
    expect(tenderAdapter).not.toHaveProperty('auth')
    expect(tenderProfile.schema).toBe(tenderSchema)
  })

  test('keeps leaf definitions documentation-free and declares one root sidecar', () => {
    expect(tenderProfile).not.toHaveProperty('docs')
    expect(tenderAdapter).not.toHaveProperty('docs')
    expect(extension.docs).toEqual({ kind: 'directory', path: './docs' })
    expect(Object.keys(tenderProfile.search?.fields ?? {})).toEqual([
      'reference',
      'buyer',
      'status',
      'deadline',
      'publishedAt',
    ])
    expect(tenderProfile.actions).toBeUndefined()
    expect(tenderProfile.artifacts).toBeUndefined()
    expect(tenderProfile.exports).toBeUndefined()
    expect(tenderProfile.relations).toBeUndefined()
    expect(tenderAdapter).toMatchObject({
      profiles: [tenderProfile],
      routing: 'indexed',
      capabilities: ['sync'],
      actions: {},
    })
    expect(Object.keys(tenderAdapter.operations)).toEqual(['sync'])
    expect(tenderAdapter.configSchema.safeParse({}).success).toBe(true)
    expect(
      tenderAdapter.configSchema.safeParse({ unexpected: true }).success,
    ).toBe(false)
  })

  test('is discoverable through its package-owned ctxindex.extensions entry', async () => {
    const packageRoot = import.meta.dir
    const manifest = await Bun.file(resolve(packageRoot, 'package.json')).json()
    expect(manifest).toMatchObject({
      type: 'module',
      ctxindex: { extensions: ['./extension.ts'] },
      dependencies: { '@ctxindex/extension-sdk': 'workspace:*' },
    })
    const resolved = await resolvePackageEntries(packageRoot, manifest, {
      origin: 'explicit-path',
    })
    const collected = await importPackageEntries(resolved)
    expect(collected.map(({ definition }) => definition.id)).toEqual([
      extension.id,
    ])
    expect(collected[0]?.definition).not.toHaveProperty('docs')
    expect(collected[0]?.documentation?.files.map(({ path }) => path)).toEqual([
      'README.md',
      'adapters/enarocanje.fixture.md',
      'profiles/enarocanje.tender@1.md',
    ])
  })
})

test('uses ordinary public SDK imports and is not bundled', async () => {
  const productionFiles = (
    await Array.fromAsync(
      new Bun.Glob('**/*.ts').scan({ cwd: import.meta.dir, absolute: true }),
    )
  ).filter((path) => !path.endsWith('.test.ts'))

  expect(productionFiles.length).toBeGreaterThan(0)
  expect(extensionPath).toContain('/examples/tenders-extension/')
  expect(productionFiles.every((path) => !path.includes('/packages/'))).toBe(
    true,
  )

  let sdkImportCount = 0
  for (const path of productionFiles) {
    const source = await Bun.file(path).text()
    expect(source).not.toContain('ExtensionAuthoringHost')
    expect(source).not.toMatch(/export\s+default\s+function/)
    expect(source).not.toContain('host.')
    sdkImportCount += source.match(/@ctxindex\/extension-sdk/g)?.length ?? 0
  }
  expect(sdkImportCount).toBe(1)

  const { CTXINDEX_BUILTIN_EXTENSIONS } = await import('@ctxindex/adapters')
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.some(
      (extension) => String(extension.id) === 'enarocanje.proof',
    ),
  ).toBe(false)
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.some((extension) =>
      extension.adapters.some(
        (adapter) => String(adapter.id) === 'enarocanje.fixture',
      ),
    ),
  ).toBe(false)
})

test('emits deterministic complete Resources and an ordered checkpoint without provider egress', async () => {
  const profile = tenderProfile
  const sync = tenderAdapter.operations.sync

  const sourceId = '01J00000000000000000000000'
  const emissions: unknown[] = []
  let fetchCalls = 0
  const forbiddenFetch = Object.assign(
    async (..._args: Parameters<typeof fetch>): Promise<Response> => {
      fetchCalls += 1
      throw new Error('provider egress is forbidden')
    },
    { preconnect() {} },
  )
  await sync({
    source: { id: sourceId, config: {} },
    cursor: null,
    mode: 'sync',
    signal: new AbortController().signal,
    logger: {
      trace() {},
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    fetch: forbiddenFetch,
    emit: (emission) => {
      emissions.push(emission)
    },
  })

  const expectedPayloads = [
    {
      reference: 'JN-001/2026',
      title: 'Supply of laboratory equipment',
      buyer: 'National Research Institute',
      publishedAt: '2026-01-15T09:00:00.000Z',
      deadline: '2026-02-12T11:00:00.000Z',
      status: 'open',
      description: 'Supply and installation of laboratory analysis equipment.',
    },
    {
      reference: 'JN-002/2026',
      title: 'Municipal bridge inspection',
      buyer: 'Municipality of Triglav',
      publishedAt: '2026-01-20T08:30:00.000Z',
      deadline: '2026-02-20T10:00:00.000Z',
      status: 'open',
      description: 'Structural inspection and reporting for municipal bridges.',
    },
  ]

  expect(fetchCalls).toBe(0)
  expect(
    profile.schema.safeParse({ ...expectedPayloads[0], unexpected: true })
      .success,
  ).toBe(false)
  expect(
    profile.schema.safeParse({ ...expectedPayloads[0], reference: undefined })
      .success,
  ).toBe(false)
  expect(emissions).toEqual([
    ...expectedPayloads.map((payload) => ({
      type: 'upsertResource',
      resource: {
        ref: `ctx://${sourceId}/tender/${encodeURIComponent(payload.reference)}`,
        profile: { id: 'enarocanje.tender', version: 1 },
        completeness: 'complete',
        title: payload.title,
        summary: payload.description,
        occurredAt: Date.parse(payload.publishedAt),
        providerUpdatedAt: Date.parse(payload.publishedAt),
        payload,
      },
    })),
    {
      type: 'checkpoint',
      cursor: {
        version: 1,
        references: ['JN-001/2026', 'JN-002/2026'],
      },
    },
  ])

  for (const [index, payload] of expectedPayloads.entries()) {
    expect(profile.schema.safeParse(payload).success).toBe(true)
    expect(profile.search?.title?.(payload)).toBe(payload.title)
    expect(profile.search?.occurredAt?.(payload)).toEqual(
      new Date(payload.publishedAt),
    )
    expect(profile.search?.chunks?.(payload)).toEqual([payload.description])
    expect(
      Object.fromEntries(
        Object.entries(profile.search?.fields ?? {}).map(([name, field]) => [
          name,
          field.extract(payload),
        ]),
      ),
    ).toEqual({
      reference: payload.reference,
      buyer: payload.buyer,
      status: payload.status,
      deadline: new Date(payload.deadline),
      publishedAt: new Date(payload.publishedAt),
    })
    const emission = emissions[index] as {
      resource: { ref: string }
    }
    const { parseRef } = await import('@ctxindex/core/ref')
    expect(parseRef(emission.resource.ref)).toMatchObject({
      sourceId,
      suffix: `tender/${encodeURIComponent(payload.reference)}`,
    })
  }
})
