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
import { TENDER_FIXTURES } from './fixtures'

const extensionPath = resolve(import.meta.dir, 'extension.ts')

describe('official instant-demo tenders Extension', () => {
  test('exports ordinary SDK values with a providerless Adapter', () => {
    expect(extension).toMatchObject({
      kind: 'extension',
      id: 'ctxindex.demo',
      adapters: [tenderAdapter],
    })
    expect(extension).not.toHaveProperty('version')
    expect(extension).not.toHaveProperty('dependencies')
    expect(tenderAdapter).toMatchObject({
      kind: 'adapter',
      id: 'ctxindex.demo.tenders',
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
      'category',
      'estimatedValue',
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
      name: '@ctxindex/demo-tenders',
      version: '0.1.0',
      license: 'MIT',
      ctxindex: { extensions: ['./demo-extension.js'] },
      devDependencies: { '@ctxindex/extension-sdk': '0.1.0' },
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
      'adapters/ctxindex.demo.tenders.md',
      'profiles/ctxindex.demo.tender@1.md',
    ])
  })

  test('keeps the checked package entry byte-for-byte current', async () => {
    const result = await Bun.build({
      entrypoints: [extensionPath],
      target: 'bun',
      minify: true,
    })
    expect(result.success, result.logs.map(String).join('\n')).toBe(true)
    expect(result.outputs).toHaveLength(1)
    expect(await result.outputs[0]?.text()).toBe(
      await Bun.file(resolve(import.meta.dir, 'demo-extension.js')).text(),
    )
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

  const { CTXINDEX_BUILTIN_EXTENSIONS } = await import('@ctxindex/official')
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.some(
      (extension) => String(extension.id) === 'ctxindex.demo',
    ),
  ).toBe(false)
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.some((extension) =>
      extension.adapters.some(
        (adapter) => String(adapter.id) === 'ctxindex.demo.tenders',
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

  const expectedPayloads = TENDER_FIXTURES

  expect(fetchCalls).toBe(0)
  expect(expectedPayloads).toHaveLength(8)
  expect(new Set(expectedPayloads.map(({ reference }) => reference)).size).toBe(
    8,
  )
  expect(new Set(expectedPayloads.map(({ buyer }) => buyer)).size).toBe(8)
  expect(new Set(expectedPayloads.map(({ category }) => category)).size).toBe(8)
  expect(new Set(expectedPayloads.map(({ status }) => status))).toEqual(
    new Set(['open', 'planned', 'awarded', 'cancelled']),
  )
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
        profile: { id: 'ctxindex.demo.tender', version: 1 },
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
        references: expectedPayloads.map(({ reference }) => reference),
      },
    },
  ])

  for (const [index, payload] of expectedPayloads.entries()) {
    expect(profile.schema.safeParse(payload).success).toBe(true)
    expect(profile.search?.title?.(payload)).toBe(payload.title)
    expect(profile.search?.occurredAt?.(payload)).toEqual(
      new Date(payload.publishedAt),
    )
    expect(profile.search?.chunks?.(payload)).toEqual([
      payload.description,
      `${payload.buyer} ${payload.category}`,
    ])
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
      category: payload.category,
      estimatedValue: payload.estimatedValue,
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
