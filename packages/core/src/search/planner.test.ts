import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  defineAdapter,
  defineExtension,
  defineProfile,
  type SearchContext,
} from '@ctxindex/extension-sdk'
import { z } from 'zod'
import type { AuthService } from '../auth'
import { CtxindexContinuationError, CtxindexValidationError } from '../errors'
import type { Logger } from '../logger'
import { createExtensionRegistry } from '../registry'
import { ResourceStore } from '../resource'
import { applyPragmas, runMigrations } from '../storage'
import { SearchPlanner } from './planner'

const ids = {
  indexed: '01KXJZAAAAAAAAAAAAAAAAAAAA',
  federated: '01KXJZBBBBBBBBBBBBBBBBBBBB',
  federated2: '01KXJZBCCCCCCCCCCCCCCCCCCC',
  hybrid: '01KXJZCCCCCCCCCCCCCCCCCCCC',
  noWindow: '01KXJZDDDDDDDDDDDDDDDDDDDD',
  disabled: '01KXJZEEEEEEEEEEEEEEEEEEEE',
  failed: '01KXJZFFFFFFFFFFFFFFFFFFFF',
  local: '01KXJZGGGGGGGGGGGGGGGGGGGG',
  unavailable: '01KXJZHHHHHHHHHHHHHHHHHHHH',
}
const calls: string[] = []
const remoteQueries: Array<{
  readonly text: string
  readonly continuation?: string
}> = []
const signals: AbortSignal[] = []
let timeoutSource: string | undefined
let failureSource: string | undefined
const timeoutSources = new Set<string>()
let barrierSource: string | undefined
let barrierPeer: string | undefined
let releaseBarrier: (() => void) | undefined
let continuationSource: string | undefined
let validationFailureSource: string | undefined
let continuationValidationFailureSource: string | undefined
let truncatedSource: string | undefined

const profile = defineProfile({
  id: 'fake.item',
  version: 1,
  schema: z.object({
    title: z.string(),
    sender: z.array(z.string()).optional(),
  }),
  search: {
    title: (payload) => payload.title,
    chunks: (payload) => [payload.title],
    fields: {
      sender: { type: 'string[]', extract: (payload) => payload.sender ?? [] },
    },
  },
})

async function remote({ source, query, signal }: SearchContext) {
  calls.push(source.id)
  remoteQueries.push(query)
  signals.push(signal)
  if (source.id === barrierSource) {
    await new Promise<void>((resolve, reject) => {
      releaseBarrier = resolve
      signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      })
    })
  } else if (source.id === barrierPeer) {
    releaseBarrier?.()
  }
  if (source.id === failureSource) {
    throw Object.assign(new Error('authorization expired'), {
      code: 'auth_expired',
    })
  }
  if (source.id === validationFailureSource) {
    throw new CtxindexValidationError(
      'invalid_filter',
      'provider filter is unsupported',
    )
  }
  if (source.id === continuationValidationFailureSource) {
    throw new CtxindexContinuationError(
      'continuation does not match this search',
    )
  }
  if (source.id === timeoutSource || timeoutSources.has(source.id)) {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted')), {
        once: true,
      }),
    )
  }
  return {
    resources: [
      {
        ref: `ctx://${source.id}/item/local`,
        profile: { id: 'fake.item', version: 1 },
        title: 'duplicate',
        payload: { title: 'duplicate', sender: ['alice@example.com'] },
      },
      {
        ref: `ctx://${source.id}/item/remote`,
        profile: { id: 'fake.item', version: 1 },
        title: query.text,
        payload: { title: query.text, sender: ['alice@example.com'] },
      },
      {
        ref: `ctx://${source.id}/item/remote`,
        profile: { id: 'fake.item', version: 1 },
        title: query.text,
        payload: { title: query.text, sender: ['alice@example.com'] },
      },
    ],
    warnings:
      source.id === truncatedSource
        ? [
            {
              code: 'truncated',
              message: 'resume with the returned continuation',
            },
          ]
        : [],
    ...(source.id === continuationSource && query.continuation === undefined
      ? { continuation: 'adapter-next-page' }
      : {}),
  }
}

const adapters = [
  defineAdapter({
    id: 'fake.indexed',
    configSchema: z.object({}).passthrough(),
    profiles: [profile],
    routing: 'indexed',
    capabilities: ['search-remote'],
    operations: { searchRemote: remote },
    actions: {},
  }),
  defineAdapter({
    id: 'fake.federated',
    configSchema: z.object({}).passthrough(),
    profiles: [profile],
    routing: 'federated',
    capabilities: ['search-remote'],
    operations: { searchRemote: remote },
    actions: {},
  }),
  defineAdapter({
    id: 'fake.local',
    configSchema: z.object({}).passthrough(),
    profiles: [profile],
    routing: 'indexed',
    capabilities: [],
    operations: {},
    actions: {},
  }),
  defineAdapter({
    id: 'fake.hybrid',
    configSchema: z
      .object({ sync_window_days: z.number().optional() })
      .passthrough(),
    profiles: [profile],
    routing: 'hybrid',
    capabilities: ['sync', 'search-remote'],
    operations: { sync: async () => {}, searchRemote: remote },
    actions: {},
  }),
]
const registry = createExtensionRegistry([
  defineExtension({
    id: 'fake.search',
    profiles: [profile],
    adapters,
  }),
])
const logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
} as unknown as Logger
const dbs: Database[] = []

async function database(): Promise<Database> {
  const db = new Database(':memory:')
  dbs.push(db)
  applyPragmas(db)
  await runMigrations(db)
  db.prepare(
    "INSERT INTO realms (id, slug, created_at) VALUES ('realm-1', 'work', 1)",
  ).run()
  return db
}

function addSource(
  db: Database,
  id: string,
  adapter: string,
  options: {
    routing?: string
    config?: object
    enabled?: boolean
    status?: 'idle' | 'failed'
  } = {},
) {
  db.prepare(
    `INSERT INTO sources (id, realm_id, label, adapter_id, config_json, sync_enabled, search_routing, created_at, updated_at) VALUES (?, 'realm-1', ?, ?, ?, ?, ?, 1, 1)`,
  ).run(
    id,
    `Test Source ${id}`,
    adapter,
    JSON.stringify(options.config ?? {}),
    options.enabled === false ? 0 : 1,
    options.routing ?? null,
  )
  if (options.status) {
    const runId = `run-${id}`
    db.prepare(
      "INSERT INTO sync_runs (id, source_id, realm_id, mode, status, started_at, completed_at) VALUES (?, ?, 'realm-1', 'full', ?, 1, 2)",
    ).run(runId, id, options.status === 'idle' ? 'completed' : 'failed')
    db.prepare(
      'INSERT INTO source_sync_state (source_id, last_status, last_run_id, updated_at) VALUES (?, ?, ?, 2)',
    ).run(id, options.status, runId)
  }
}

function planner(db: Database) {
  return new SearchPlanner({
    db,
    registry,
    authService: {} as AuthService,
    logger,
  })
}

afterEach(() => {
  calls.length = 0
  remoteQueries.length = 0
  signals.length = 0
  timeoutSource = undefined
  failureSource = undefined
  timeoutSources.clear()
  barrierSource = undefined
  barrierPeer = undefined
  releaseBarrier = undefined
  continuationSource = undefined
  validationFailureSource = undefined
  continuationValidationFailureSource = undefined
  truncatedSource = undefined
  for (const db of dbs.splice(0)) db.close()
})

describe('SearchPlanner', () => {
  test('preflights kind, fields, bounds, and exact selection before any provider leg', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    const service = planner(db)

    await expect(
      service.search({
        text: 'x',
        fields: [{ name: 'sender', value: 'alice' }],
      }),
    ).rejects.toThrow('Field filters require --kind')
    await expect(
      service.search({ text: 'x', kind: 'missing' }),
    ).rejects.toThrow('Unknown kind')
    await expect(
      service.search({ text: 'x', since: 2, until: 1 }),
    ).rejects.toThrow('since must not be after until')
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(service.search({ text: 'x', limit })).rejects.toThrow(
        'limit must be a positive integer',
      )
    }
    await expect(
      service.search({ text: 'x', realms: ['missing'] }),
    ).rejects.toThrow('Unknown Realm')
    await expect(
      service.search({ text: 'x', sourceIds: ['missing'] }),
    ).rejects.toThrow('Unknown Source')
    expect(calls).toEqual([])
  })

  test('uses CLI over source over Adapter routing, warns on stale overrides, and explains decisions', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed', { routing: 'federated' })
    addSource(db, ids.federated, 'fake.federated')
    addSource(db, ids.noWindow, 'fake.indexed', { routing: 'hybrid' })
    const service = planner(db)

    const sourceOverride = await service.search({
      text: 'x',
      sourceIds: [ids.indexed],
      explain: true,
    })
    expect(calls).toEqual([ids.indexed])
    expect(sourceOverride.explain?.sources[0]).toMatchObject({
      routing: 'federated',
      decidedBy: 'source',
      legs: ['remote'],
    })

    calls.length = 0
    const cliOverride = await service.search({
      text: 'x',
      sourceIds: [ids.federated],
      localOnly: true,
      explain: true,
    })
    expect(calls).toEqual([])
    expect(cliOverride.explain?.sources[0]).toMatchObject({
      routing: 'indexed',
      decidedBy: 'cli',
      legs: ['local'],
    })

    const stale = await service.search({
      text: 'x',
      sourceIds: [ids.noWindow],
      explain: true,
    })
    expect(stale.warnings).toContainEqual(
      expect.objectContaining({
        sourceId: ids.noWindow,
        code: 'stale_search_routing',
      }),
    )
    expect(stale.explain?.sources[0]).toMatchObject({
      routing: 'indexed',
      decidedBy: 'adapter',
    })
  })

  test('warns deterministically when --remote selects an unsupported Source', async () => {
    const db = await database()
    addSource(db, ids.local, 'fake.local')

    const result = await planner(db).search({
      text: 'x',
      remote: true,
      explain: true,
    })

    expect(result.results).toEqual([])
    expect(result.warnings).toEqual([
      {
        sourceId: ids.local,
        code: 'remote_search_unsupported',
        message: `Source "${ids.local}" does not support remote search`,
      },
    ])
    expect(result.explain?.sources[0]?.outcome).toBe('unsupported')
  })

  test('keeps an unavailable-Adapter Source locally searchable and degrades remote explain', async () => {
    const db = await database()
    addSource(db, ids.unavailable, 'missing.adapter')
    new ResourceStore(db, registry.profiles).upsert({
      ref: `ctx://${ids.unavailable}/item/local`,
      sourceId: ids.unavailable,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { title: 'unavailable local', sender: ['alice@example.com'] },
    })
    const service = planner(db)
    const filters = {
      text: 'unavailable',
      realms: ['work'],
      sourceIds: [ids.unavailable],
      adapterId: 'missing.adapter',
      kind: 'fake.item',
      explain: true,
    } as const

    for (const input of [filters, { ...filters, localOnly: true }]) {
      const result = await service.search(input)
      expect(result.results).toHaveLength(1)
      expect(result.results[0]).toMatchObject({
        sourceId: ids.unavailable,
        origin: 'local',
      })
      expect(result.warnings).toEqual([
        expect.objectContaining({
          sourceId: ids.unavailable,
          code: 'extension_unavailable',
        }),
      ])
      expect(result.explain?.sources[0]).toMatchObject({
        decidedBy: 'unavailable',
        legs: ['local'],
        outcome: 'extension_unavailable',
      })
    }

    const remote = await service.search({ ...filters, remote: true })
    expect(remote.results).toEqual([])
    expect(remote.warnings).toEqual([
      expect.objectContaining({
        sourceId: ids.unavailable,
        code: 'extension_unavailable',
      }),
    ])
    expect(remote.explain?.sources[0]).toMatchObject({
      decidedBy: 'unavailable',
      legs: [],
      outcome: 'extension_unavailable',
    })
    expect(calls).toEqual([])
  })

  test('starts sorted provider legs concurrently with independent timeouts', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    addSource(db, ids.federated2, 'fake.federated')
    barrierSource = ids.federated
    barrierPeer = ids.federated2

    const barrier = await planner(db).search({ text: 'x', timeoutMs: 40 })
    expect(calls).toEqual([ids.federated, ids.federated2])
    expect(barrier.warnings).toEqual([])

    calls.length = 0
    signals.length = 0
    barrierSource = undefined
    barrierPeer = undefined
    releaseBarrier = undefined
    timeoutSources.add(ids.federated)
    timeoutSources.add(ids.federated2)
    const timedOut = await planner(db).search({ text: 'x', timeoutMs: 40 })

    expect(calls).toEqual([ids.federated, ids.federated2])
    expect(signals).toHaveLength(2)
    expect(signals[0]).not.toBe(signals[1])
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(timedOut.warnings.map((warning) => warning.code)).toEqual([
      'timeout',
      'timeout',
    ])
  })

  test('requires verified hybrid coverage or includes remote', async () => {
    const db = await database()
    const now = 2_000_000_000_000
    addSource(db, ids.hybrid, 'fake.hybrid', {
      config: { sync_window_days: 7 },
      status: 'idle',
    })
    addSource(db, ids.noWindow, 'fake.hybrid', { status: 'idle' })
    addSource(db, ids.disabled, 'fake.hybrid', {
      config: { sync_window_days: 7 },
      enabled: false,
      status: 'idle',
    })
    addSource(db, ids.failed, 'fake.hybrid', {
      config: { sync_window_days: 7 },
      status: 'failed',
    })

    const result = await planner(db).search({
      text: 'x',
      kind: 'fake.item',
      since: now - 1_000,
      now,
      explain: true,
    })
    expect(calls).toEqual([ids.noWindow, ids.disabled, ids.failed].sort())
    expect(
      result.explain?.sources.find((source) => source.sourceId === ids.hybrid)
        ?.legs,
    ).toEqual(['local'])
    expect(
      result.explain?.sources
        .filter((source) => source.sourceId !== ids.hybrid)
        .every((source) => source.legs.join(',') === 'local,remote'),
    ).toBe(true)

    calls.length = 0
    await planner(db).search({ text: 'x', sourceIds: [ids.hybrid], now })
    expect(calls).toEqual([ids.hybrid])
  })

  test('preserves local results, aborts timeout, dedupes local-first, and interleaves by origin rank', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed')
    addSource(db, ids.federated, 'fake.federated')
    new ResourceStore(db, registry.profiles).upsert({
      ref: `ctx://${ids.indexed}/item/local`,
      sourceId: ids.indexed,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      payload: { title: 'x', sender: ['alice@example.com'] },
    })
    timeoutSource = ids.federated

    const result = await planner(db).search({
      text: 'x',
      remote: false,
      timeoutMs: 5,
      explain: true,
    })
    expect(signals[0]?.aborted).toBe(true)
    expect(result.results[0]).toMatchObject({
      ref: `ctx://${ids.indexed}/item/local`,
      origin: 'local',
      originRank: 0,
    })
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ sourceId: ids.federated, code: 'timeout' }),
    )

    timeoutSource = undefined
    failureSource = ids.federated
    const failed = await planner(db).search({ text: 'x' })
    expect(failed.results[0]).toMatchObject({ origin: 'local' })
    expect(failed.warnings).toContainEqual(
      expect.objectContaining({
        sourceId: ids.federated,
        code: 'auth_expired',
      }),
    )

    failureSource = undefined
    const mixed = await planner(db).search({ text: 'x', limit: 5 })
    expect(
      mixed.results.filter(
        (item) => item.ref === `ctx://${ids.indexed}/item/local`,
      ),
    ).toHaveLength(1)
    expect(mixed.results.map((item) => item.sourceId)).toEqual([
      ids.indexed,
      ids.federated,
      ids.federated,
    ])
    expect(new Set(mixed.results.map((item) => item.ref)).size).toBe(
      mixed.results.length,
    )
  })

  test('propagates caller cancellation into active remote searches', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    timeoutSource = ids.federated
    const controller = new AbortController()
    const pending = planner(db).search({
      text: 'x',
      signal: controller.signal,
      timeoutMs: 10_000,
    })
    while (signals.length === 0) await Promise.resolve()
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'cancelled',
    })
    expect(signals[0]?.aborted).toBe(true)
  })

  test('filter-only enumeration is local-only and never invokes remote search', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed')
    addSource(db, ids.federated, 'fake.federated')
    const store = new ResourceStore(db, registry.profiles)
    for (const [suffix, occurredAt] of [
      ['a', 3000],
      ['b', 1000],
      ['c', 2000],
    ] as const) {
      store.upsert({
        ref: `ctx://${ids.indexed}/item/${suffix}`,
        sourceId: ids.indexed,
        profile: { id: 'fake.item', version: 1 },
        origin: 'synced',
        completeness: 'complete',
        occurredAt,
        payload: { title: `enum ${suffix}` },
      })
    }
    const service = planner(db)

    const result = await service.search({ realms: ['work'], explain: true })
    expect(calls).toEqual([])
    expect(result.results.map((item) => item.ref)).toEqual([
      `ctx://${ids.indexed}/item/a`,
      `ctx://${ids.indexed}/item/c`,
      `ctx://${ids.indexed}/item/b`,
    ])
    expect(result.pagination).toEqual({ offset: 0, limit: 20, hasMore: false })
    for (const source of result.explain?.sources ?? []) {
      expect(source.legs).toEqual(['local'])
    }
  })

  test('runs constrained query-less remote search and resumes one exact Source', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    continuationSource = ids.federated
    const service = planner(db)

    const first = await service.search({
      remote: true,
      sourceIds: [ids.federated],
      kind: 'fake.item',
      limit: 2,
    })
    expect(remoteQueries[0]).toMatchObject({ text: '' })
    expect(first.pagination).toEqual({
      limit: 2,
      hasMore: true,
      continuation: 'adapter-next-page',
    })

    const second = await service.search({
      remote: true,
      sourceIds: [ids.federated],
      kind: 'fake.item',
      limit: 2,
      continuation: 'adapter-next-page',
    })
    expect(remoteQueries[1]).toMatchObject({
      text: '',
      continuation: 'adapter-next-page',
    })
    expect(second.pagination).toEqual({
      limit: 2,
      hasMore: false,
      continuation: null,
    })

    await expect(
      service.search({ remote: true, includeDeleted: true }),
    ).rejects.toMatchObject({ code: 'invalid_filter' })
    expect(calls).toHaveLength(2)
  })

  test('replaces unusable multi-Source continuation guidance with an exact Source rerun', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    addSource(db, ids.federated2, 'fake.federated')
    truncatedSource = ids.federated
    continuationSource = ids.federated

    const result = await planner(db).search({
      text: 'shipment',
      remote: true,
      sourceIds: [ids.federated, ids.federated2],
    })

    expect(result.pagination).toBeUndefined()
    expect(result.warnings).toContainEqual({
      sourceId: ids.federated,
      code: 'truncated',
      message: `Remote results were truncated; rerun the unchanged search with exact Source ${ids.federated}`,
    })
  })

  test('rejects invalid continuation modes before provider execution', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    addSource(db, ids.federated2, 'fake.federated')
    const service = planner(db)

    for (const input of [
      { text: 'x', continuation: 'next' },
      { text: 'x', remote: true, continuation: 'next' },
      {
        text: 'x',
        remote: true,
        sourceIds: [ids.federated, ids.federated2],
        continuation: 'next',
      },
      {
        text: 'x',
        remote: true,
        sourceIds: [ids.federated],
        offset: 1,
        continuation: 'next',
      },
      {
        text: 'x',
        localOnly: true,
        sourceIds: [ids.federated],
        continuation: 'next',
      },
    ]) {
      await expect(service.search(input)).rejects.toMatchObject({
        code: 'invalid_filter',
      })
    }
    expect(calls).toEqual([])
  })

  test('propagates Adapter continuation validation as invalid usage', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    continuationValidationFailureSource = ids.federated

    await expect(
      planner(db).search({
        text: 'changed',
        remote: true,
        sourceIds: [ids.federated],
        continuation: 'adapter-next-page',
      }),
    ).rejects.toMatchObject({
      code: 'invalid_filter',
      message: 'continuation does not match this search',
    })
  })

  test('degrades one ordinary Adapter validation failure without aborting peer Sources', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    addSource(db, ids.federated2, 'fake.federated')
    validationFailureSource = ids.federated

    const result = await planner(db).search({
      text: 'ordinary',
      remote: true,
      sourceIds: [ids.federated, ids.federated2],
    })

    expect(calls).toEqual([ids.federated, ids.federated2])
    expect(result.results).toHaveLength(2)
    expect(
      result.results.every(({ sourceId }) => sourceId === ids.federated2),
    ).toBe(true)
    expect(result.warnings).toContainEqual({
      sourceId: ids.federated,
      code: 'invalid_filter',
      message: 'provider filter is unsupported',
    })
  })

  test('degrades an ordinary validation failure during exact continuation resume', async () => {
    const db = await database()
    addSource(db, ids.federated, 'fake.federated')
    validationFailureSource = ids.federated

    const result = await planner(db).search({
      text: 'ordinary',
      remote: true,
      sourceIds: [ids.federated],
      continuation: 'adapter-next-page',
    })

    expect(result.results).toEqual([])
    expect(result.pagination).toEqual({
      limit: 20,
      hasMore: false,
      continuation: null,
    })
    expect(result.warnings).toEqual([
      {
        sourceId: ids.federated,
        code: 'invalid_filter',
        message: 'provider filter is unsupported',
      },
    ])
  })

  test('includes local tombstones only when requested and exposes their deletion time', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed')
    const store = new ResourceStore(db, registry.profiles)
    store.upsert({
      ref: `ctx://${ids.indexed}/item/active`,
      sourceId: ids.indexed,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      occurredAt: 1000,
      payload: { title: 'active' },
    })
    const deletedRef = `ctx://${ids.indexed}/item/deleted`
    store.upsert({
      ref: deletedRef,
      sourceId: ids.indexed,
      profile: { id: 'fake.item', version: 1 },
      origin: 'synced',
      completeness: 'complete',
      occurredAt: 2000,
      payload: { title: 'deleted' },
    })
    store.remove({ ref: deletedRef, sourceId: ids.indexed, deletedAt: 1234 })
    const service = planner(db)
    const filters = {
      realms: ['work'],
      sourceIds: [ids.indexed],
      kind: 'fake.item',
    } as const

    const ordinary = await service.search(filters)
    expect(ordinary.results).toEqual([
      expect.objectContaining({
        ref: `ctx://${ids.indexed}/item/active`,
      }),
    ])
    expect(ordinary.results[0]).not.toHaveProperty('deletedAt')

    const included = await service.search({ ...filters, includeDeleted: true })
    expect(included.results).toEqual([
      expect.objectContaining({ ref: deletedRef, deletedAt: 1234 }),
      expect.objectContaining({
        ref: `ctx://${ids.indexed}/item/active`,
      }),
    ])
    expect(included.results[1]).not.toHaveProperty('deletedAt')
    expect(included.pagination).toEqual({
      offset: 0,
      limit: 20,
      hasMore: false,
    })

    const includedWithoutOtherFilters = await service.search({
      includeDeleted: true,
    })
    expect(includedWithoutOtherFilters.results).toEqual(included.results)

    addSource(db, ids.federated, 'fake.federated')
    const remote = await service.search({
      text: 'remote',
      sourceIds: [ids.federated],
      remote: true,
      includeDeleted: true,
    })
    expect(calls).toEqual([ids.federated])
    expect(remote.results.every((result) => result.origin === 'provider')).toBe(
      true,
    )
    expect(remote.results.every((result) => !('deletedAt' in result))).toBe(
      true,
    )
  })

  test('paginates local execution deterministically with hasMore boundaries', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed')
    const store = new ResourceStore(db, registry.profiles)
    for (let index = 0; index < 5; index += 1) {
      store.upsert({
        ref: `ctx://${ids.indexed}/item/p${index}`,
        sourceId: ids.indexed,
        profile: { id: 'fake.item', version: 1 },
        origin: 'synced',
        completeness: 'complete',
        occurredAt: 1000 + index,
        payload: { title: `page ${index}` },
      })
    }
    const service = planner(db)

    const first = await service.search({ realms: ['work'], limit: 2 })
    const second = await service.search({
      realms: ['work'],
      limit: 2,
      offset: 2,
    })
    const third = await service.search({
      realms: ['work'],
      limit: 2,
      offset: 4,
    })
    expect(first.pagination).toEqual({ offset: 0, limit: 2, hasMore: true })
    expect(second.pagination).toEqual({ offset: 2, limit: 2, hasMore: true })
    expect(third.pagination).toEqual({ offset: 4, limit: 2, hasMore: false })
    const refs = [first, second, third].flatMap((page) =>
      page.results.map((item) => item.ref),
    )
    expect(new Set(refs).size).toBe(5)

    const localOnly = await service.search({
      text: 'page',
      localOnly: true,
      limit: 2,
      offset: 2,
    })
    expect(localOnly.pagination).toEqual({ offset: 2, limit: 2, hasMore: true })
    expect(localOnly.results).toHaveLength(2)
  })

  test('rejects bare search and non-local offset', async () => {
    const db = await database()
    addSource(db, ids.indexed, 'fake.indexed')
    addSource(db, ids.federated, 'fake.federated')
    const service = planner(db)

    await expect(service.search({})).rejects.toThrow(
      'query text or at least one filter is required',
    )
    const remote = await service.search({
      remote: true,
      sourceIds: [ids.federated],
    })
    expect(remote.results.length).toBeGreaterThan(0)
    calls.length = 0
    await expect(service.search({ text: 'x', offset: 5 })).rejects.toThrow(
      'offset requires local execution',
    )
    await expect(
      service.search({ text: 'x', remote: true, offset: 5 }),
    ).rejects.toThrow('offset requires local execution')
    for (const offset of [-1, 1.5, Number.NaN]) {
      await expect(
        service.search({ realms: ['work'], offset }),
      ).rejects.toThrow('offset must be a non-negative integer')
    }
    expect(calls).toEqual([])
  })
})
