import { afterEach, expect, spyOn, test } from 'bun:test'
import type { RpcHealthResult, RpcShutdownAccepted } from '@ctxindex/rpc'
import { DaemonCliError, type DaemonSelection } from './client'
import type { DaemonCommandDeps } from './command'
import { handleDaemonCommand, resolveDaemonLaunch } from './command'

const digest = 'a'.repeat(64)
const selection = {} as DaemonSelection
const health: RpcHealthResult = {
  protocol: { id: 'ctxindex.local', version: 1 },
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
const accepted: RpcShutdownAccepted = {
  status: 'accepted',
  instanceId: 'instance-1',
  acceptedAt: '2026-07-18T00:00:01.000Z',
  alreadyStopping: false,
  observationTimeoutMs: 5000,
}

function deps(overrides: Partial<DaemonCommandDeps> = {}): DaemonCommandDeps {
  return {
    select: () => selection,
    health: async () => health,
    shutdown: async () => accepted,
    serve: async () => 0,
    ...overrides,
  }
}

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('malformed lifecycle argv performs zero selection or transport work', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let selected = 0
  const commandDeps = deps({
    select: () => {
      selected += 1
      return selection
    },
  })
  expect(await handleDaemonCommand(['health', '--unknown'], commandDeps)).toBe(
    2,
  )
  expect(selected).toBe(0)
  expect(String(error.mock.calls[0]?.[0])).toContain('unknown flag')
})

test('foreground launch uses the pinned Bun executable in source mode', () => {
  const launch = resolveDaemonLaunch({
    sourceMode: true,
    processExecutable: '/pinned/bun',
  })
  expect(launch[0]).toBe('/pinned/bun')
  expect(launch[1]?.endsWith('/apps/daemon/src/main.ts')).toBe(true)
})

test('foreground serve preserves the daemon structured startup exit', async () => {
  expect(
    await handleDaemonCommand(['serve'], deps({ serve: async () => 50 })),
  ).toBe(50)
})

test('compiled launch rejects a missing sibling without ambient PATH lookup', () => {
  expect(() =>
    resolveDaemonLaunch({
      sourceMode: false,
      processExecutable: '/missing/bin/ctxindex',
    }),
  ).toThrow('compiled daemon executable is unavailable')
})

test('health JSON is the result value without an RPC envelope', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  expect(await handleDaemonCommand(['health', '--json'], deps())).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual(health)
  expect(String(log.mock.calls[0]?.[0])).not.toContain('"ok"')
})

test('shutdown reports complete only after the facade observes release', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  expect(await handleDaemonCommand(['shutdown', '--json'], deps())).toBe(0)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
    status: 'complete',
    instanceId: 'instance-1',
  })
})

test.each([
  ['protocol_incompatible', 50],
  ['shutdown_timeout', 50],
  ['cancelled', 130],
] as const)('maps lifecycle failure %s to exit %i', async (code, exitCode) => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const failure =
    code === 'protocol_incompatible'
      ? {
          kind: code,
          code,
          message: 'The daemon protocol is incompatible; restart or upgrade.',
          clientProtocol: { id: 'ctxindex.local' as const, version: 1 },
          daemonProtocol: { id: 'ctxindex.local' as const, version: 2 },
        }
      : code === 'shutdown_timeout'
        ? {
            kind: code,
            code,
            message: 'The daemon remains stopping.',
            instanceId: 'instance-1',
            timeoutMs: 5000,
          }
        : {
            kind: code,
            code,
            message: 'The request was cancelled.',
          }
  expect(
    await handleDaemonCommand(
      ['health'],
      deps({
        health: async () => {
          throw new DaemonCliError(failure)
        },
      }),
    ),
  ).toBe(exitCode)
  expect(String(error.mock.calls[0]?.[0])).toBe(failure.message)
})
