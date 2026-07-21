import { expect, test } from 'bun:test'
import type { RpcHealthResult } from '@ctxindex/rpc'
import { CLI_DAEMON_PROTOCOL, type DaemonSelection } from './client'
import {
  createDaemonSelectionEnsurer,
  type DaemonSelectionEnsurerDependencies,
} from './ensure'

const digest = 'a'.repeat(64)
const selection = {
  endpoint: '/tmp/ctxd.sock',
  roots: {
    configRoot: '/config',
    dataRoot: '/data',
    stateRoot: '/state',
    cacheRoot: '/cache',
    databasePath: '/data/ctxindex.sqlite',
    identity: {
      tupleDigest: digest,
      configDigest: digest,
      dataDigest: digest,
      stateDigest: digest,
      cacheDigest: digest,
      databaseDigest: digest,
    },
  },
  metadata: null,
  selectedBy: 'test_override',
} satisfies DaemonSelection

const health = {
  protocol: CLI_DAEMON_PROTOCOL,
  runtime: selection.roots.identity,
  daemonVersion: '0.0.0',
  buildVersion: 'development',
  instanceId: 'instance-1',
  pid: 123,
  startedAt: '2026-07-18T00:00:00.000Z',
  lifecycle: 'ready',
  ready: true,
  extensionDiagnosticsCount: 0,
  activeRequestCount: 0,
} satisfies RpcHealthResult

function dependencies(
  overrides: Partial<DaemonSelectionEnsurerDependencies> = {},
): DaemonSelectionEnsurerDependencies {
  return {
    select: () => selection,
    status: async () => ({ status: 'running', health }),
    start: async () => ({ status: 'running', started: false, health }),
    ...overrides,
  }
}

test('reuses an already-selected healthy daemon without lifecycle startup', async () => {
  const order: string[] = []
  const controller = new AbortController()
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      select: () => {
        order.push('select')
        return selection
      },
      status: async (signal) => {
        expect(signal).toBeUndefined()
        order.push('status')
        return { status: 'running', health }
      },
      start: async () => {
        throw new Error('start must not run for a selected daemon')
      },
    }),
  )

  await expect(ensure(controller.signal)).resolves.toEqual({
    status: 'selected',
    selection,
    started: false,
  })
  expect(order).toEqual(['status', 'select'])
})

test('starts an absent supported daemon and resolves its published selection', async () => {
  const order: string[] = []
  let current: DaemonSelection | null = null
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      select: () => {
        order.push('select')
        return current
      },
      status: async () => {
        order.push('status')
        return { status: 'stopped' }
      },
      start: async () => {
        order.push('start')
        current = selection
        return { status: 'running', started: true, health }
      },
    }),
  )

  await expect(ensure()).resolves.toEqual({
    status: 'selected',
    selection,
    started: true,
  })
  expect(order).toEqual(['status', 'start', 'select'])
})

test('returns an explicit unsupported signal without attempting startup', async () => {
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      select: () => null,
      status: async () => ({ status: 'unsupported' }),
      start: async () => {
        throw new Error('unsupported platforms must not attempt startup')
      },
    }),
  )

  await expect(ensure()).resolves.toEqual({ status: 'unsupported' })
})

test('a selected stale daemon is restarted instead of falling back', async () => {
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      status: async () => ({ status: 'stopped' }),
      start: async () => {
        return { status: 'running', started: true, health }
      },
    }),
  )

  await expect(ensure()).resolves.toEqual({
    status: 'selected',
    selection,
    started: true,
  })
})

test('cancellation is preserved before selection and while starting', async () => {
  const cancelled = new AbortController()
  cancelled.abort()
  const ensureCancelled = createDaemonSelectionEnsurer(
    dependencies({
      select: () => {
        throw new Error('pre-cancelled ensure must not inspect discovery')
      },
    }),
  )
  await expect(ensureCancelled(cancelled.signal)).rejects.toMatchObject({
    code: 'cancelled',
  })

  const controller = new AbortController()
  const ensureStarting = createDaemonSelectionEnsurer(
    dependencies({
      select: () => null,
      status: async (signal) => {
        expect(signal).toBeUndefined()
        return { status: 'stopped' }
      },
      start: async (signal) => {
        expect(signal).toBeUndefined()
        controller.abort()
        return { status: 'running', started: true, health }
      },
    }),
  )
  await expect(ensureStarting(controller.signal)).rejects.toMatchObject({
    code: 'cancelled',
  })
})

test('concurrent callers share one startup while cancellation stays caller-local', async () => {
  let release!: () => void
  const started = new Promise<void>((resolve) => {
    release = resolve
  })
  let starts = 0
  let current: DaemonSelection | null = null
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      select: () => current,
      status: async () => ({ status: 'stopped' }),
      start: async () => {
        starts += 1
        await started
        current = selection
        return { status: 'running', started: true, health }
      },
    }),
  )
  const cancelled = new AbortController()
  const first = ensure(cancelled.signal)
  cancelled.abort()
  await expect(first).rejects.toMatchObject({ code: 'cancelled' })
  const second = ensure()
  release()
  await expect(second).resolves.toEqual({
    status: 'selected',
    selection,
    started: true,
  })
  expect(starts).toBe(1)
})

test('missing discovery after successful startup fails closed', async () => {
  const ensure = createDaemonSelectionEnsurer(
    dependencies({
      select: () => null,
      status: async () => ({ status: 'stopped' }),
      start: async () => ({ status: 'running', started: true, health }),
    }),
  )

  await expect(ensure()).rejects.toMatchObject({
    code: 'daemon_unavailable',
  })
})
