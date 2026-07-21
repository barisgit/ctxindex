import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { CtxindexError, CtxindexSyncError } from '@ctxindex/core/errors'
import type { SyncRunResult } from '@ctxindex/core/sync'
import { DaemonCliError, type DaemonSelection } from '../daemon/client'
import {
  formatSyncOutput,
  handleSyncCommand,
  mapRpcSyncFailureToExit,
  type SyncDeps,
  type SyncOutput,
  type SyncRouteServices,
  type SyncServices,
} from '../sync/runner'

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

function source(id: string, adapterId = 'sync.adapter', syncEnabled = true) {
  return {
    id,
    realm_id: 'realm-1',
    adapter_id: adapterId,
    label: id,
    config_json: '{}',
    sync_enabled: syncEnabled,
    created_at: 1,
  }
}

function harness(input: {
  readonly sources?: ReturnType<typeof source>[]
  readonly adapters?: Record<string, { sync: boolean } | undefined>
  readonly run?: SyncServices['syncSource']
}) {
  const sources = input.sources ?? [source('source-a')]
  let closed = false
  const deps = {
    db: {},
    authService: {},
    logger: {},
    sourceService: {
      resolveSourceId: (reference: string) => {
        const match = sources.find(
          (item) => item.id === reference || item.label === reference,
        )
        if (!match) throw new Error(`Source not found: "${reference}"`)
        return match.id
      },
      listSources: () => sources,
      findSourceById: (id: string) =>
        sources.find((item) => item.id === id) ?? null,
    },
    registry: {
      profiles: {},
      adapters: {
        get: ({ id }: { id: string }) => {
          const entry = input.adapters?.[id] ?? { sync: true }
          if (!entry) return undefined
          return {
            id,
            capabilities: entry.sync ? ['sync'] : ['retrieve'],
            operations: entry.sync ? { sync() {} } : {},
          }
        },
      },
    },
    async close() {
      closed = true
    },
  } as unknown as SyncDeps
  const calls: Array<{ sourceId: string; mode: string }> = []
  const services: SyncServices = {
    syncSource:
      input.run ??
      (async (syncInput) => {
        calls.push({ sourceId: syncInput.sourceId, mode: syncInput.mode })
        return { ...completed, mode: syncInput.mode }
      }),
  }
  return {
    open: async () => deps,
    services,
    calls,
    closed: () => closed,
  }
}

const directRoutes: SyncRouteServices = {
  selectDaemon: () => null,
  daemonSync: async () => {
    throw new Error('daemon transport invoked')
  },
}

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

describe('sync command', () => {
  test.each([
    ['auth_expired', 10],
    ['auth_revoked', 10],
    ['rate_limited', 20],
    ['network', 30],
    ['provider_unavailable', 30],
    ['provider_bad_response', 30],
    ['provider_quota', 30],
    ['permission_denied', 40],
    ['unknown', 50],
    ['cancelled', 130],
  ] as const)('maps RPC sync code %s to direct exit %i', (code, exitCode) => {
    expect(mapRpcSyncFailureToExit(code)).toBe(exitCode)
  })

  test('selected RPC preserves sync JSON values without an envelope or direct open', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    let opened = false
    const routes: SyncRouteServices = {
      selectDaemon: () => {
        throw new Error('legacy selection invoked')
      },
      ensureDaemonSelection: async () => ({
        status: 'selected',
        selection: {} as DaemonSelection,
        started: true,
      }),
      daemonSync: async (_daemon, _input, _signal, onEvent) => {
        await onEvent?.({
          type: 'source.started',
          sequence: 0,
          sourceId: 'source-a',
          mode: 'sync',
        })
        await onEvent?.({
          type: 'source.completed',
          sequence: 1,
          sourceId: 'source-a',
          run: completed,
        })
        return {
          mode: 'sync',
          results: [
            {
              sourceId: 'source-a',
              status: 'completed',
              run: completed,
            },
          ],
          warnings: [
            {
              sourceId: 'source-a',
              code: 'binary',
              message: 'Skipped binary file',
            },
          ],
        }
      },
    }
    expect(
      await handleSyncCommand(
        { mode: 'sync', json: true, format: 'summary' },
        async () => {
          opened = true
          throw new Error('selected RPC must not open direct deps')
        },
        harness({}).services,
        routes,
      ),
    ).toBe(0)
    expect(opened).toBe(false)
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      mode: 'sync',
      results: [{ sourceId: 'source-a', status: 'completed', run: completed }],
      warnings: [
        {
          sourceId: 'source-a',
          code: 'binary',
          message: 'Skipped binary file',
        },
      ],
    })
    expect(String(log.mock.calls[0]?.[0])).not.toContain('"ok"')
    expect(log).toHaveBeenCalledTimes(1)
  })

  test('selected RPC preserves the established failed-sync projection exactly', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const expected = {
      sourceId: 'source-a',
      status: 'failed' as const,
      warningsCount: 1,
      lastWarning: {
        code: 'degraded',
        message: 'partial provider response',
        ref: 'ctx://source-a/message/1',
      },
      errorsCount: 1,
      lastError: 'Sync failed for Source "source-a" (network)',
      error: {
        code: 'network',
        message: 'Sync failed for Source "source-a" (network)',
      },
      exitCode: 30,
    }
    expect(
      await handleSyncCommand(
        { mode: 'sync', json: true, format: 'summary' },
        async () => {
          throw new Error('selected RPC must not open direct deps')
        },
        harness({}).services,
        {
          selectDaemon: () => ({}) as DaemonSelection,
          daemonSync: async () => ({
            mode: 'sync',
            results: [
              {
                sourceId: expected.sourceId,
                status: 'failed',
                failure: expected.error,
                diagnostics: {
                  warningsCount: expected.warningsCount,
                  lastWarning: expected.lastWarning,
                  errorsCount: 1,
                  lastError: expected.lastError,
                },
              },
            ],
            warnings: [],
          }),
        },
      ),
    ).toBe(30)
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).results[0]).toEqual(
      expected,
    )
  })

  test('selected unreachable sync rejects unavailable without direct fallback', async () => {
    let opened = false
    await expect(
      handleSyncCommand(
        { mode: 'sync', json: false, format: 'summary' },
        async () => {
          opened = true
          throw new Error('must not open')
        },
        harness({}).services,
        {
          selectDaemon: () => ({}) as DaemonSelection,
          daemonSync: async () => {
            throw new DaemonCliError({
              kind: 'daemon_unavailable',
              code: 'daemon_unavailable',
              message: 'The local daemon is unavailable.',
            })
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(opened).toBe(false)
  })

  test('renders stable summary and compact output', () => {
    const output: SyncOutput = {
      mode: 'sync',
      results: [{ sourceId: 'source-a', status: 'completed', run: completed }],
      warnings: [
        {
          sourceId: 'source-a',
          code: 'binary',
          message: 'Skipped binary file',
        },
      ],
    }

    expect(formatSyncOutput(output, 'summary', false)).toBe(
      'source-a\tcompleted\tadded=2\tupdated=1\tdeleted=0\twarnings=1\terrors=0\n' +
        'source-a\twarning\tbinary\tSkipped binary file',
    )
    expect(formatSyncOutput(output, 'compact', false)).toBe(
      'source-a completed +2 ~1 -0 warnings=1 errors=0\n' +
        'source-a warning=binary Skipped binary file',
    )
  })

  test('renders warning-then-failure diagnostics in JSON, summary, compact, and events output', () => {
    const failed = {
      sourceId: 'source-a',
      status: 'failed' as const,
      warningsCount: 1,
      lastWarning: {
        code: 'degraded',
        message: 'partial provider response',
      },
      errorsCount: 1,
      lastError: 'Sync failed for Source "source-a" (network)',
      error: {
        code: 'network',
        message: 'Sync failed for Source "source-a" (network)',
      },
      exitCode: 30,
    }
    const output: SyncOutput = {
      mode: 'sync',
      results: [failed],
      warnings: [
        {
          sourceId: 'source-a',
          code: 'degraded',
          message: 'partial provider response',
        },
      ],
    }

    expect(JSON.parse(formatSyncOutput(output, 'summary', true))).toEqual(
      output,
    )
    expect(formatSyncOutput(output, 'summary', false)).toBe(
      'source-a\tfailed\twarnings=1\terrors=1\tcode=network\texit=30\tSync failed for Source "source-a" (network)\n' +
        'source-a\twarning\tdegraded\tpartial provider response',
    )
    expect(formatSyncOutput(output, 'compact', false)).toBe(
      'source-a failed warnings=1 errors=1 code=network exit=30 error=Sync_failed_for_Source_"source-a"_(network)\n' +
        'source-a warning=degraded partial provider response',
    )
    const { status: _status, ...failedEvent } = failed
    expect(JSON.parse(formatSyncOutput(output, 'events', false))).toEqual({
      type: 'source.failed',
      ...failedEvent,
    })
  })

  test('syncs one explicit Source through the public core service and closes deps', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const setup = harness({})

    expect(
      await handleSyncCommand(
        { sourceId: 'source-a', mode: 'diff', json: true, format: 'summary' },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(0)
    expect(setup.calls).toEqual([{ sourceId: 'source-a', mode: 'diff' }])
    expect(setup.closed()).toBe(true)
    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
      mode: 'diff',
      results: [
        {
          sourceId: 'source-a',
          status: 'completed',
          run: { ...completed, mode: 'diff' },
        },
      ],
      warnings: [
        {
          sourceId: 'source-a',
          code: 'binary',
          message: 'Skipped binary file',
        },
      ],
    })
  })

  test('fails fast for an unknown explicit Source', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const setup = harness({ sources: [] })

    expect(
      await handleSyncCommand(
        { sourceId: 'missing', mode: 'sync', json: false, format: 'summary' },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(2)
    expect(setup.calls).toEqual([])
    expect(String(error.mock.calls[0]?.[0])).toContain('missing')
    expect(setup.closed()).toBe(true)
  })

  test('fails fast for an explicitly targeted disabled Source without provider calls', async () => {
    const error = spyOn(console, 'error').mockImplementation(() => {})
    const setup = harness({
      sources: [source('source-disabled', undefined, false)],
    })

    expect(
      await handleSyncCommand(
        {
          sourceId: 'source-disabled',
          mode: 'sync',
          json: false,
          format: 'summary',
        },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(2)
    expect(setup.calls).toEqual([])
    expect(String(error.mock.calls[0]?.[0])).toBe(
      'Source is not sync-enabled: "source-disabled"',
    )
    expect(setup.closed()).toBe(true)
  })

  test('explicit Source reports a loaded non-sync Adapter as unsupported', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const setup = harness({
      sources: [source('source-a', 'read.adapter')],
      adapters: { 'read.adapter': { sync: false } },
      run: async () => {
        throw new CtxindexError('Adapter detail', 'sync_unsupported')
      },
    })

    expect(
      await handleSyncCommand(
        { sourceId: 'source-a', mode: 'sync', json: true, format: 'summary' },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(2)
    expect(JSON.parse(String(log.mock.calls[0]?.[0])).results[0]).toEqual({
      sourceId: 'source-a',
      status: 'failed',
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 1,
      lastError: 'Sync failed for Source "source-a" (sync_unsupported)',
      error: {
        code: 'sync_unsupported',
        message: 'Sync failed for Source "source-a" (sync_unsupported)',
      },
      exitCode: 2,
    })
  })

  test('all mode is id-ordered, skips loaded non-sync Adapters, includes unavailable Sources, and continues', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const calls: string[] = []
    const setup = harness({
      sources: [
        source('source-c', 'sync.adapter'),
        source('source-a', 'read.adapter'),
        source('source-b', 'missing.adapter'),
        source('source-disabled', 'sync.adapter', false),
      ],
      adapters: {
        'sync.adapter': { sync: true },
        'read.adapter': { sync: false },
        'missing.adapter': undefined,
      },
      run: async (input) => {
        calls.push(input.sourceId)
        if (input.sourceId === 'source-b') {
          throw new CtxindexError(
            'private path must not leak',
            'adapter_unavailable',
          )
        }
        return completed
      },
    })

    expect(
      await handleSyncCommand(
        { mode: 'sync', json: true, format: 'summary' },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(50)
    expect(calls).toEqual(['source-b', 'source-c'])
    const output = JSON.parse(String(log.mock.calls[0]?.[0]))
    expect(
      output.results.map((item: { sourceId: string }) => item.sourceId),
    ).toEqual(['source-b', 'source-c'])
    expect(output.results[0]).toEqual({
      sourceId: 'source-b',
      status: 'failed',
      warningsCount: 0,
      lastWarning: null,
      errorsCount: 1,
      lastError: 'Sync failed for Source "source-b" (adapter_unavailable)',
      error: {
        code: 'adapter_unavailable',
        message: 'Sync failed for Source "source-b" (adapter_unavailable)',
      },
      exitCode: 50,
    })
    expect(JSON.stringify(output)).not.toContain('private path')
  })

  test('uses the worst stable exit and renders deterministic live events', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const setup = harness({
      sources: [source('source-b'), source('source-a')],
      run: async (input) => {
        if (input.sourceId === 'source-a') {
          throw new CtxindexSyncError('cancelled detail', 'cancelled')
        }
        throw new CtxindexSyncError('network detail', 'network')
      },
    })

    expect(
      await handleSyncCommand(
        { mode: 'sync', json: false, format: 'events' },
        setup.open,
        setup.services,
        directRoutes,
      ),
    ).toBe(130)
    expect(log.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
      {
        type: 'source.started',
        sequence: 0,
        sourceId: 'source-a',
        mode: 'sync',
      },
      {
        type: 'source.failed',
        sourceId: 'source-a',
        warningsCount: 0,
        lastWarning: null,
        errorsCount: 1,
        lastError: 'Sync failed for Source "source-a" (cancelled)',
        error: {
          code: 'cancelled',
          message: 'Sync failed for Source "source-a" (cancelled)',
        },
        exitCode: 130,
      },
      {
        type: 'source.started',
        sequence: 2,
        sourceId: 'source-b',
        mode: 'sync',
      },
      {
        type: 'source.failed',
        sourceId: 'source-b',
        warningsCount: 0,
        lastWarning: null,
        errorsCount: 1,
        lastError: 'Sync failed for Source "source-b" (network)',
        error: {
          code: 'network',
          message: 'Sync failed for Source "source-b" (network)',
        },
        exitCode: 30,
      },
    ])
  })
})
