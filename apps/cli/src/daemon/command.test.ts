import { afterEach, expect, spyOn, test } from 'bun:test'
import type { RpcHealthResult } from '@ctxindex/rpc'
import { handleDaemonCommand } from './command'
import type {
  DaemonLifecycle,
  DaemonStartResult,
  DaemonStatusResult,
  DaemonStopResult,
} from './lifecycle'

const digest = 'a'.repeat(64)
const health: RpcHealthResult = {
  protocol: { id: 'ctxindex.local', version: 2 },
  runtime: {
    tupleDigest: digest,
    configDigest: digest,
    dataDigest: digest,
    stateDigest: digest,
    cacheDigest: digest,
    databaseDigest: digest,
  },
  daemonVersion: '0.0.0',
  buildVersion: 'development',
  instanceId: 'instance-1',
  pid: 123,
  startedAt: '2026-07-18T00:00:00.000Z',
  lifecycle: 'ready',
  ready: true,
  extensionDiagnosticsCount: 0,
  activeRequestCount: 0,
}

function lifecycle(overrides: Partial<DaemonLifecycle> = {}): DaemonLifecycle {
  return {
    start: async (): Promise<DaemonStartResult> => ({
      status: 'running',
      started: true,
      health,
    }),
    status: async (): Promise<DaemonStatusResult> => ({
      status: 'running',
      health,
    }),
    stop: async (): Promise<DaemonStopResult> => ({
      status: 'stopped',
      alreadyStopped: false,
      instanceId: 'instance-1',
    }),
    ...overrides,
  }
}

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('start JSON reports whether a background process was launched', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  expect(
    await handleDaemonCommand({ kind: 'start', json: true }, lifecycle()),
  ).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
    status: 'running',
    started: true,
    health,
  })
})

test('status reports stopped successfully without starting', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  let starts = 0
  expect(
    await handleDaemonCommand(
      { kind: 'status', json: true },
      lifecycle({
        start: async () => {
          starts += 1
          throw new Error('must not start')
        },
        status: async () => ({ status: 'stopped' }),
      }),
    ),
  ).toBe(0)
  expect(starts).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
    status: 'stopped',
  })
})

test('stop is idempotent when already stopped', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  expect(
    await handleDaemonCommand(
      { kind: 'stop', json: true },
      lifecycle({
        stop: async () => ({ status: 'stopped', alreadyStopped: true }),
      }),
    ),
  ).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
    status: 'stopped',
    alreadyStopped: true,
  })
})

test('lifecycle cancellation maps to stable exit 130', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  expect(
    await handleDaemonCommand(
      { kind: 'start', json: false },
      lifecycle({
        start: async () =>
          Promise.reject(
            Object.assign(new Error('Daemon startup was cancelled.'), {
              code: 'cancelled',
            }),
          ),
      }),
    ),
  ).toBe(130)
  expect(String(error.mock.calls[0]?.[0])).toContain('cancelled')
})
