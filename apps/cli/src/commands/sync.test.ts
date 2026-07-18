import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { CtxindexError, CtxindexSyncError } from '@ctxindex/core/errors'
import type { SyncRunResult } from '@ctxindex/core/sync'
import {
  formatSyncOutput,
  handleSyncCommand,
  type SyncDeps,
  type SyncOutput,
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
    adapter_version: 1,
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
        get: ({ id }: { id: string; version: number }) => {
          const entry = input.adapters?.[id] ?? { sync: true }
          if (!entry) return undefined
          return {
            id,
            version: 1,
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

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

describe('sync command', () => {
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
        ['--source', 'source-a', '--mode', 'diff', '--json'],
        setup.open,
        setup.services,
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
        ['--source', 'missing'],
        setup.open,
        setup.services,
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
        ['--source', 'source-disabled'],
        setup.open,
        setup.services,
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
        ['--source', 'source-a', '--json'],
        setup.open,
        setup.services,
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
      await handleSyncCommand(['--json'], setup.open, setup.services),
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

  test('uses the worst stable exit and renders deterministic completed events', async () => {
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
        ['--format', 'events'],
        setup.open,
        setup.services,
      ),
    ).toBe(130)
    expect(
      String(log.mock.calls[0]?.[0])
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([
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
