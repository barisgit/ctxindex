import { afterEach, expect, spyOn, test } from 'bun:test'
import { DaemonCliError, type DaemonSelection } from '../daemon/client'
import { handleStatusCommand, type StatusCommandDeps } from './status'

const selection = {} as DaemonSelection

function deps(overrides: Partial<StatusCommandDeps> = {}): StatusCommandDeps {
  return {
    selectDaemon: () => null,
    daemonStatus: async () => ({ rows: [] }),
    open: async () =>
      ({
        sourceService: { getStatus: () => [] },
        close: async () => {},
      }) as unknown as Awaited<ReturnType<StatusCommandDeps['open']>>,
    ...overrides,
  }
}

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('selected RPC status preserves JSON shape and never opens direct deps', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const rows = [
    {
      sourceId: 'source-a',
      adapterId: 'local.directory',
      realmSlug: 'work',
      availability: 'available' as const,
      lastStatus: 'idle',
      lastRunAt: 1,
      warningsCount: 1,
      lastWarning: {
        code: 'binary',
        message: 'Skipped binary file',
        ref: 'ctx://source-a/file/a.bin',
      },
      errorsCount: 1,
      lastError: 'Sync failed for Source "source-a" (network)',
      cursor: { page: 2 },
    },
  ]
  expect(
    await handleStatusCommand(
      { format: 'json' },
      deps({
        selectDaemon: () => {
          throw new Error('legacy selection invoked')
        },
        ensureDaemonSelection: async () => ({
          status: 'selected',
          selection,
          started: true,
        }),
        daemonStatus: async () => ({ rows }),
        open: async () => {
          throw new Error('selected RPC must not fall back')
        },
      }),
    ),
  ).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual(rows)
})

test('selected unreachable status fails unavailable without direct fallback', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let opened = false
  expect(
    await handleStatusCommand(
      { format: 'text' },
      deps({
        selectDaemon: () => selection,
        daemonStatus: async () => {
          throw new DaemonCliError({
            kind: 'daemon_unavailable',
            code: 'daemon_unavailable',
            message: 'The local daemon is unavailable.',
          })
        },
        open: async () => {
          opened = true
          throw new Error('must not open')
        },
      }),
    ),
  ).toBe(50)
  expect(opened).toBe(false)
  expect(String(error.mock.calls[0]?.[0])).toBe(
    'The local daemon is unavailable.',
  )
})

test.each([
  ['invalid_filter', 'Source is disabled: "source-a"'],
  ['not_found', 'Source not found: "missing"'],
] as const)('selected RPC %s preserves direct diagnostic and exit 2', async (code, message) => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  expect(
    await handleStatusCommand(
      { sourceId: 'source-a', format: 'text' },
      deps({
        selectDaemon: () => selection,
        daemonStatus: async () => {
          throw new DaemonCliError({
            kind: 'ctxindex',
            taxonomy: code === 'not_found' ? 'lookup' : 'validation',
            code,
            message,
          })
        },
      }),
    ),
  ).toBe(2)
  expect(String(error.mock.calls[0]?.[0])).toBe(message)
})

test('no selector retains the direct status path and closes it', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  let closed = false
  expect(
    await handleStatusCommand(
      { format: 'json' },
      deps({
        open: async () =>
          ({
            sourceService: { getStatus: () => [] },
            close: async () => {
              closed = true
            },
          }) as unknown as Awaited<ReturnType<StatusCommandDeps['open']>>,
      }),
    ),
  ).toBe(0)
  expect(closed).toBe(true)
  expect(String(log.mock.calls[0]?.[0])).toBe('[]')
})
