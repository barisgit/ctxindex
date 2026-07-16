import { describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { defaultConfig } from '@ctxindex/core/config'
import { loadExtensions } from '@ctxindex/core/extension'

const extensionPath = resolve(import.meta.dir, 'extension.ts')

describe('external tenders Extension proof', () => {
  test('loads exact definitions from an explicit path', async () => {
    const result = await loadExtensions({
      config: {
        ...defaultConfig(),
        extensions: { paths: [extensionPath] },
      },
      builtins: [],
    })

    expect(result.diagnostics).toEqual([])
    expect(
      result.registry.list().map(({ id, version }) => ({ id, version })),
    ).toEqual([{ id: 'enarocanje.proof', version: 1 }])

    const profile = result.registry.profiles.get({
      id: 'enarocanje.tender',
      version: 1,
    })
    expect(profile?.docs?.aliases).toEqual(['tenders'])
    expect(Object.keys(profile?.search?.fields ?? {})).toEqual([
      'reference',
      'buyer',
      'status',
      'deadline',
      'publishedAt',
    ])
    expect(profile?.actions).toBeUndefined()
    expect(profile?.artifacts).toBeUndefined()
    expect(profile?.exports).toBeUndefined()
    expect(profile?.relations).toBeUndefined()

    const adapter = result.registry.adapters.get({
      id: 'enarocanje.fixture',
      version: 1,
    })
    expect(adapter).toMatchObject({
      auth: { kind: 'none' },
      profiles: [{ id: 'enarocanje.tender', version: 1 }],
      routing: 'indexed',
      capabilities: ['sync'],
      actions: {},
    })
    expect(Object.keys(adapter?.operations ?? {})).toEqual(['sync'])
    expect(adapter?.configSchema.safeParse({}).success).toBe(true)
    expect(adapter?.configSchema.safeParse({ unexpected: true }).success).toBe(
      false,
    )
  })
})

test('uses only the public type-only SDK import and is not bundled', async () => {
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

  for (const path of productionFiles) {
    const source = await Bun.file(path).text()
    const publicTypeImport =
      /import\s+type\s+\{\s*ExtensionAuthoringHost\s*\}\s+from\s+['"]@ctxindex\/extension-sdk['"]\s*/g
    const withoutPublicTypeImport = source.replace(publicTypeImport, '')
    expect(withoutPublicTypeImport).not.toContain('@ctxindex/')
  }

  const { CTXINDEX_BUILTIN_EXTENSIONS } = await import('@ctxindex/adapters')
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.some(
      (extension) => String(extension.id) === 'enarocanje.proof',
    ),
  ).toBe(false)
  expect(
    CTXINDEX_BUILTIN_EXTENSIONS.flatMap((extension) => extension.adapters).some(
      (adapter) => String(adapter.id) === 'enarocanje.fixture',
    ),
  ).toBe(false)
})

test('emits deterministic complete Resources and an ordered checkpoint without provider egress', async () => {
  const result = await loadExtensions({
    config: {
      ...defaultConfig(),
      extensions: { paths: [extensionPath] },
    },
    builtins: [],
  })
  const profile = result.registry.profiles.get({
    id: 'enarocanje.tender',
    version: 1,
  })
  const adapter = result.registry.adapters.get({
    id: 'enarocanje.fixture',
    version: 1,
  })
  const sync = adapter?.operations.sync
  if (!profile || typeof sync !== 'function') {
    throw new Error('loaded tenders definitions are incomplete')
  }

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
