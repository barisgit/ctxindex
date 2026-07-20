import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { CtxindexError, CtxindexSyncError } from '../errors'
import { createProfileRegistry } from '../registry/profile-registry'
import type { SourceRow, SourceService } from '../source'
import { applyPragmas } from '../storage/db'
import { runMigrations } from '../storage/migrator'
import {
  SyncApplicationService,
  type SyncApplicationServiceDeps,
} from './application-service'
import type { SyncRunResult } from './sync-coordinator'
import { SyncCoordinator } from './sync-coordinator'

const completed: SyncRunResult = {
  runId: 'run-1',
  mode: 'sync',
  status: 'completed',
  added: 2,
  updated: 1,
  deleted: 0,
  warningsCount: 1,
  lastWarning: { code: 'binary', message: 'Skipped binary file' },
  errorsCount: 0,
  warnings: [{ code: 'binary', message: 'Skipped binary file' }],
}

function source(
  id: string,
  options: {
    readonly label?: string
    readonly adapterId?: string
    readonly syncEnabled?: boolean
  } = {},
): SourceRow {
  return {
    id,
    realm_id: 'realm-1',
    adapter_id: options.adapterId ?? 'sync.adapter',
    label: options.label ?? id,
    config_json: '{}',
    sync_enabled: options.syncEnabled ?? true,
    availability: 'available',
    created_at: 1,
  }
}

function harness(input: {
  readonly sources?: readonly SourceRow[]
  readonly adapters?: Readonly<
    Record<string, { readonly sync: boolean } | undefined>
  >
  readonly run?: SyncApplicationServiceDeps['syncSource']
}) {
  const sources = [...(input.sources ?? [source('source-a')])]
  const calls: Array<{
    readonly sourceId: string
    readonly mode: string
    readonly signal: AbortSignal
  }> = []
  const sourceService: Pick<
    SourceService,
    'resolveSourceId' | 'findSourceById' | 'listSources'
  > = {
    resolveSourceId(reference) {
      const match = sources.find(
        (item) => item.id === reference || item.label === reference,
      )
      if (!match) throw new Error('missing')
      return match.id
    },
    findSourceById(id) {
      return sources.find((item) => item.id === id) ?? null
    },
    listSources() {
      return sources
    },
  }
  const service = new SyncApplicationService({
    db: {} as SyncApplicationServiceDeps['db'],
    registry: {
      adapters: {
        get: ({ id }: { readonly id: string }) => {
          const entry = input.adapters?.[id] ?? { sync: true }
          if (!entry) return undefined
          return {
            capabilities: entry.sync ? ['sync'] : ['retrieve'],
            operations: entry.sync ? { sync() {} } : {},
          }
        },
      },
    } as unknown as SyncApplicationServiceDeps['registry'],
    authService: {} as SyncApplicationServiceDeps['authService'],
    logger: {} as SyncApplicationServiceDeps['logger'],
    sourceService,
    syncSource:
      input.run ??
      (async (syncInput) => {
        calls.push({
          sourceId: syncInput.sourceId,
          mode: syncInput.mode,
          signal: syncInput.signal,
        })
        return { ...completed, mode: syncInput.mode }
      }),
  })
  return { service, calls }
}

async function failureWithWarning(): Promise<CtxindexSyncError> {
  const db = new Database(':memory:', { create: true })
  try {
    applyPragmas(db)
    await runMigrations(db)
    db.exec("INSERT INTO realms VALUES ('realm-1', 'realm-1', NULL, 1)")
    db.prepare(
      'INSERT INTO sources (id, realm_id, adapter_id, label, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('source-b', 'realm-1', 'sync.adapter', 'source-b', '{}', 1, 1)
    const failure = new CtxindexSyncError('network failure', 'network')
    const coordinator = new SyncCoordinator(db, createProfileRegistry([]))
    try {
      await coordinator.run(
        {
          sourceId: 'source-b',
          mode: 'sync',
          signal: new AbortController().signal,
        },
        async ({ emit }) => {
          await emit({
            type: 'warning',
            code: 'degraded',
            message: 'partial response',
          })
          throw failure
        },
      )
    } catch (error) {
      expect(error).toBe(failure)
    }
    return failure
  } finally {
    db.close()
  }
}

describe('SyncApplicationService', () => {
  test('resolves one Source by exact label or id and forwards the request signal', async () => {
    const setup = harness({
      sources: [source('source-id', { label: 'source-label' })],
    })
    const signal = new AbortController().signal

    const byLabel = await setup.service.run({
      source: 'source-label',
      mode: 'diff',
      signal,
    })
    await setup.service.run({ source: 'source-id', mode: 'sync', signal })

    expect(byLabel.results[0]).toEqual({
      sourceId: 'source-id',
      status: 'completed',
      run: { ...completed, mode: 'diff' },
    })
    expect(setup.calls).toEqual([
      { sourceId: 'source-id', mode: 'diff', signal },
      { sourceId: 'source-id', mode: 'sync', signal },
    ])
  })

  test('rejects a missing or disabled targeted Source before provider work', async () => {
    const missing = harness({ sources: [] })
    await expect(
      missing.service.run({
        source: 'missing',
        mode: 'sync',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'invalid_filter',
        message: 'Source not found: "missing"',
      }),
    )
    expect(missing.calls).toEqual([])

    const disabled = harness({
      sources: [source('disabled', { syncEnabled: false })],
    })
    await expect(
      disabled.service.run({
        source: 'disabled',
        mode: 'sync',
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'invalid_filter',
        message: 'Source is not sync-enabled: "disabled"',
      }),
    )
    expect(disabled.calls).toEqual([])
  })

  test('filters disabled and loaded non-sync Sources while retaining unavailable Sources in deterministic id order', async () => {
    const setup = harness({
      sources: [
        source('source-c'),
        source('source-a', { adapterId: 'read.adapter' }),
        source('source-b', { adapterId: 'missing.adapter' }),
        source('source-disabled', { syncEnabled: false }),
      ],
      adapters: {
        'read.adapter': { sync: false },
        'missing.adapter': undefined,
      },
      run: async (input) => {
        if (input.sourceId === 'source-b') {
          throw new CtxindexError(
            'unavailable Extension detail',
            'adapter_unavailable',
          )
        }
        return completed
      },
    })

    const result = await setup.service.run({
      mode: 'sync',
      signal: new AbortController().signal,
    })

    expect(result.results.map((item) => item.sourceId)).toEqual([
      'source-b',
      'source-c',
    ])
    expect(result.results.map((item) => item.status)).toEqual([
      'failed',
      'completed',
    ])
  })

  test('continues after a typed failure and preserves failure identity with bounded diagnostics', async () => {
    const failure = new CtxindexError(
      `private provider detail ${'x'.repeat(3_000)}`,
      'adapter_unavailable',
    )
    const setup = harness({
      sources: [source('source-b'), source('source-a')],
      run: async (input) => {
        if (input.sourceId === 'source-a') throw failure
        return completed
      },
    })

    const result = await setup.service.run({
      mode: 'sync',
      signal: new AbortController().signal,
    })

    expect(result.results.map((item) => item.sourceId)).toEqual([
      'source-a',
      'source-b',
    ])
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        sourceId: 'source-a',
        status: 'failed',
        error: failure,
        diagnostics: expect.objectContaining({
          warningsCount: 0,
          lastWarning: null,
          errorsCount: 1,
        }),
      }),
    )
    const failed = result.results[0]
    expect(
      failed?.status === 'failed' && failed.diagnostics.lastError.length,
    ).toBe(2_048)
  })

  test('aggregates completed and failed-Source warnings', async () => {
    const failure = await failureWithWarning()
    const setup = harness({
      sources: [source('source-a'), source('source-b')],
      run: async (input) => {
        if (input.sourceId === 'source-b') throw failure
        return completed
      },
    })

    const result = await setup.service.run({
      mode: 'sync',
      signal: new AbortController().signal,
    })

    expect(result.warnings).toEqual([
      {
        sourceId: 'source-a',
        code: 'binary',
        message: 'Skipped binary file',
      },
      {
        sourceId: 'source-b',
        code: 'degraded',
        message: 'partial response',
      },
    ])
  })

  test('passes one AbortSignal unchanged and preserves cancellation failure identity', async () => {
    const controller = new AbortController()
    const cancellation = new CtxindexSyncError('cancelled', 'cancelled')
    const signals: AbortSignal[] = []
    const setup = harness({
      sources: [source('source-a'), source('source-b')],
      run: async (input) => {
        signals.push(input.signal)
        if (input.sourceId === 'source-a') controller.abort()
        throw cancellation
      },
    })

    const result = await setup.service.run({
      mode: 'sync',
      signal: controller.signal,
    })

    expect(signals).toEqual([controller.signal, controller.signal])
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(
      result.results.every(
        (item) => item.status === 'failed' && item.error === cancellation,
      ),
    ).toBe(true)
  })
})
