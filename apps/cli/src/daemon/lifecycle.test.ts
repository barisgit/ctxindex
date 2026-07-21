import { afterEach, expect, test } from 'bun:test'
import {
  chmodSync,
  closeSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CtxindexError } from '@ctxindex/core/errors'
import type { DiscoveryMetadata } from '@ctxindex/local-daemon'
import type { RpcHealthResult } from '@ctxindex/rpc'
import {
  CLI_DAEMON_PROTOCOL,
  DaemonCliError,
  type DaemonSelection,
} from './client'
import {
  createDaemonLifecycle,
  type DaemonLifecycleDependencies,
  launchBackgroundDaemon,
  openDaemonDiagnostics,
  removeStaleDaemonEndpoint,
  resolveDaemonLaunch,
} from './lifecycle'

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0)) {
    rmSync(path, { force: true, recursive: true })
  }
})

const digest = 'a'.repeat(64)
const metadata: DiscoveryMetadata = {
  schemaVersion: 1,
  protocolId: 'ctxindex.local',
  protocolVersion: CLI_DAEMON_PROTOCOL.version,
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
  instanceId: 'instance-1',
  ownerToken: 'b'.repeat(64),
  pid: 123,
  startedAt: '2026-07-18T00:00:00.000Z',
  lifecycle: 'ready',
  endpointToken: 'ctxd-aaaaaaaaaaaaaaaaaaaaaaaa.sock',
}
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
  metadata,
  selectedBy: 'metadata',
} satisfies DaemonSelection
const health: RpcHealthResult = {
  protocol: CLI_DAEMON_PROTOCOL,
  runtime: selection.roots.identity,
  daemonVersion: '0.0.0',
  buildVersion: 'development',
  instanceId: 'instance-1',
  pid: 123,
  startedAt: metadata.startedAt,
  lifecycle: 'ready',
  ready: true,
  extensionDiagnosticsCount: 0,
  activeRequestCount: 0,
}

function dependencies(
  overrides: Partial<DaemonLifecycleDependencies> = {},
): DaemonLifecycleDependencies {
  return {
    supported: () => true,
    assertInitialized: async () => {},
    runtimeKey: () => digest,
    select: () => selection,
    health: async () => health,
    shutdown: async () => ({
      status: 'accepted',
      instanceId: health.instanceId,
      acceptedAt: '2026-07-18T00:00:01.000Z',
      alreadyStopping: false,
      observationTimeoutMs: 5000,
    }),
    launch: () => {},
    cleanupStale: () => 'removed',
    now: () => 0,
    sleep: async () => {},
    timeoutSignal: () => new AbortController().signal,
    ...overrides,
  }
}

test('source launch uses the pinned Bun executable', () => {
  expect(
    resolveDaemonLaunch({
      sourceMode: true,
      processExecutable: '/pinned/bun',
    }),
  ).toEqual([
    '/pinned/bun',
    expect.stringContaining('/apps/daemon/src/main.ts'),
  ])
})

test('compiled launch rejects a missing sibling without ambient PATH lookup', () => {
  expect(() =>
    resolveDaemonLaunch({
      sourceMode: false,
      processExecutable: '/missing/bin/ctxindex',
      compiledDaemonOverride: '/missing/bin/ctxindex-daemon',
    }),
  ).toThrow('compiled daemon executable is unavailable')
})

test('compiled executable fallback resolves a sibling beside process.execPath', () => {
  const root = mkdtempSync(join(tmpdir(), 'ctxindex-compiled-launch-'))
  cleanup.push(root)
  const daemon = join(root, 'ctxindex-daemon')
  writeFileSync(daemon, '#!/bin/sh\n')
  chmodSync(daemon, 0o755)
  expect(
    resolveDaemonLaunch({
      sourceMode: false,
      processExecutable: join(root, 'ctxindex'),
    }),
  ).toEqual([daemon])
})

test('background launch is detached, ignores stdin, redirects output, and unrefs', () => {
  let options: Record<string, unknown> | undefined
  let unrefs = 0
  const closed: number[] = []
  launchBackgroundDaemon(['/daemon'], '/state', {
    openDiagnostics: () => 41,
    closeDescriptor: (fd) => closed.push(fd),
    spawn: (_argv, input) => {
      options = input as unknown as Record<string, unknown>
      return {
        unref: () => {
          unrefs += 1
        },
      }
    },
  })
  expect(options).toMatchObject({
    detached: true,
    stdin: 'ignore',
    stdout: 41,
    stderr: 41,
  })
  expect(unrefs).toBe(1)
  expect(closed).toEqual([41])
})

test('daemon diagnostics use owner-private directory and file modes', () => {
  const root = mkdtempSync(join(tmpdir(), 'ctxindex-daemon-diagnostics-'))
  cleanup.push(root)
  const descriptor = openDaemonDiagnostics(root)
  closeSync(descriptor)
  expect(statSync(join(root, 'daemon')).mode & 0o777).toBe(0o700)
  expect(statSync(join(root, 'daemon', 'startup.log')).mode & 0o777).toBe(0o600)
})

test('start completes initialization before discovery or launch', async () => {
  const order: string[] = []
  let current: DaemonSelection | null = null
  const lifecycle = createDaemonLifecycle(
    dependencies({
      assertInitialized: async () => {
        order.push('initialized')
      },
      select: () => {
        order.push('selected')
        return current
      },
      launch: () => {
        order.push('launched')
        current = selection
      },
    }),
  )
  await lifecycle.start()
  expect(order.slice(0, 3)).toEqual(['initialized', 'selected', 'launched'])
})

test('already-running start reuses health without launching', async () => {
  let launches = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      launch: () => {
        launches += 1
      },
    }),
  )
  expect(await lifecycle.start()).toEqual({
    status: 'running',
    started: false,
    health,
  })
  expect(launches).toBe(0)
})

test('absent start launches and polls compatible health', async () => {
  let current: DaemonSelection | null = null
  let launches = 0
  let ticks = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => current,
      launch: () => {
        launches += 1
      },
      health: async () => health,
      now: () => ticks,
      sleep: async () => {
        ticks += 25
        current = selection
      },
    }),
  )
  expect(await lifecycle.start()).toEqual({
    status: 'running',
    started: true,
    health,
  })
  expect(launches).toBe(1)
})

test('start waits for a stopping owner to release before launching its replacement', async () => {
  let current: DaemonSelection | null = {
    ...selection,
    metadata: { ...metadata, lifecycle: 'stopping' },
  }
  let clock = 0
  let launches = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => current,
      health: async (selected) => {
        if (selected.metadata?.lifecycle === 'ready') return health
        throw new DaemonCliError({
          kind: 'daemon_unavailable',
          code: 'daemon_unavailable',
          message: 'The daemon is stopping and is not accepting new work.',
        })
      },
      cleanupStale: () => {
        if (clock < 750) return 'busy'
        current = null
        return 'removed'
      },
      launch: () => {
        launches += 1
        if (current === null) current = selection
      },
      now: () => clock,
      sleep: async (milliseconds) => {
        clock += milliseconds
      },
    }),
  )

  await expect(lifecycle.start()).resolves.toEqual({
    status: 'running',
    started: true,
    health,
  })
  expect(clock).toBeGreaterThanOrEqual(750)
  expect(launches).toBe(1)
})

test.each([
  'start',
  'status',
  'stop',
] as const)('%s preserves health-probe cancellation without lifecycle side effects', async (action) => {
  let launches = 0
  let shutdowns = 0
  let cleanups = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      health: async () => {
        throw Object.assign(new Error('cancelled health probe'), {
          code: 'cancelled' as const,
        })
      },
      launch: () => {
        launches += 1
      },
      shutdown: async () => {
        shutdowns += 1
        throw new Error('must not shut down after cancellation')
      },
      cleanupStale: () => {
        cleanups += 1
        return 'removed'
      },
    }),
  )

  await expect(lifecycle[action]()).rejects.toMatchObject({
    code: 'cancelled',
  })
  expect({ launches, shutdowns, cleanups }).toEqual({
    launches: 0,
    shutdowns: 0,
    cleanups: 0,
  })
})

test('launch failures do not expose host paths or raw errors', async () => {
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => null,
      launch: () => {
        throw new Error('spawn /private/secret/ctxindex-daemon EACCES')
      },
    }),
  )
  try {
    await lifecycle.start()
    throw new Error('expected start to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('could not be launched')
    expect((error as Error).message).not.toContain('/private/secret')
    expect((error as Error).message).not.toContain('EACCES')
  }
})

test('start sanitizes runtime identity failures before initialization', async () => {
  const lifecycle = createDaemonLifecycle(
    dependencies({
      runtimeKey: () => {
        throw new Error('dangling symlink /private/secret/runtime')
      },
    }),
  )
  try {
    await lifecycle.start()
    throw new Error('expected start to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(DaemonCliError)
    expect((error as Error).message).toBe(
      'The local daemon could not be started safely.',
    )
    expect((error as Error).message).not.toContain('/private/secret')
  }
})

test('start preserves explicit initialization guidance', async () => {
  const expected = new CtxindexError(
    'ctxindex is not initialized; run ctxindex init',
    'invalid_args',
  )
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => null,
      assertInitialized: async () => {
        throw expected
      },
    }),
  )
  await expect(lifecycle.start()).rejects.toBe(expected)
})

test('start fails after its bounded readiness deadline', async () => {
  let clock = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => null,
      now: () => {
        clock += 10_001
        return clock
      },
    }),
  )
  await expect(lifecycle.start()).rejects.toThrow('did not become ready')
})

test('start cancellation interrupts readiness polling', async () => {
  const controller = new AbortController()
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => null,
      sleep: async () => {
        controller.abort()
      },
    }),
  )
  try {
    await lifecycle.start(controller.signal)
    throw new Error('expected start to be cancelled')
  } catch (error) {
    expect(error).toMatchObject({ code: 'cancelled' })
  }
})

test('concurrent starts in one CLI process share one launch', async () => {
  let current: DaemonSelection | null = null
  let launches = 0
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => current,
      launch: () => {
        launches += 1
      },
      sleep: async () => {
        await waiting
        current = selection
      },
    }),
  )
  const first = lifecycle.start()
  const second = lifecycle.start()
  release()
  expect(await Promise.all([first, second])).toHaveLength(2)
  expect(launches).toBe(1)
})

test('status is observational for stopped and transitional metadata', async () => {
  let current: DaemonSelection | null = null
  let launches = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => current,
      launch: () => {
        launches += 1
      },
      health: async () => {
        throw new Error('unreachable')
      },
    }),
  )
  expect(await lifecycle.status()).toEqual({ status: 'stopped' })
  current = {
    ...selection,
    metadata: { ...metadata, lifecycle: 'starting' },
  }
  expect(await lifecycle.status()).toMatchObject({
    status: 'starting',
    instanceId: metadata.instanceId,
  })
  current = {
    ...selection,
    metadata: { ...metadata, lifecycle: 'stopping' },
  }
  expect(await lifecycle.status()).toMatchObject({ status: 'stopping' })
  current = selection
  expect(await lifecycle.status()).toMatchObject({ status: 'unavailable' })
  expect(launches).toBe(0)
})

test('status bounds a health request that never settles', async () => {
  const timeout = new AbortController()
  timeout.abort()
  const lifecycle = createDaemonLifecycle(
    dependencies({
      health: async () => new Promise<RpcHealthResult>(() => {}),
      timeoutSignal: () => timeout.signal,
    }),
  )
  expect(await lifecycle.status()).toMatchObject({ status: 'unavailable' })
})

test.each([
  'status',
  'stop',
] as const)('%s sanitizes unexpected discovery filesystem failures', async (action) => {
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => {
        throw new Error('open /private/secret/discovery.json EACCES')
      },
    }),
  )
  try {
    await lifecycle[action]()
    throw new Error(`expected ${action} to fail`)
  } catch (error) {
    expect(error).toBeInstanceOf(DaemonCliError)
    expect((error as Error).message).not.toContain('/private/secret')
    expect((error as Error).message).not.toContain('EACCES')
  }
})

test('stop is idempotent and cleans stale state without signalling a PID', async () => {
  let current: DaemonSelection | null = null
  let cleanups = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => current,
      health: async () => {
        throw new Error('unreachable')
      },
      cleanupStale: () => {
        cleanups += 1
        return 'removed'
      },
    }),
  )
  expect(await lifecycle.stop()).toEqual({
    status: 'stopped',
    alreadyStopped: true,
  })
  current = selection
  expect(await lifecycle.stop()).toEqual({
    status: 'stopped',
    alreadyStopped: false,
    instanceId: metadata.instanceId,
  })
  expect(cleanups).toBe(1)
})

test('stop lease-cleans unreachable stopping metadata after a crash', async () => {
  let shutdowns = 0
  let cleanups = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => ({
        ...selection,
        metadata: { ...metadata, lifecycle: 'stopping' },
      }),
      health: async () => {
        throw new Error('unreachable')
      },
      shutdown: async () => {
        shutdowns += 1
        throw new Error('must not call shutdown without health')
      },
      cleanupStale: () => {
        cleanups += 1
        return 'removed'
      },
    }),
  )
  expect(await lifecycle.stop()).toEqual({
    status: 'stopped',
    alreadyStopped: false,
    instanceId: metadata.instanceId,
  })
  expect(shutdowns).toBe(0)
  expect(cleanups).toBe(1)
})

test('stop uses graceful RPC for live transitional health', async () => {
  let shutdowns = 0
  let cleanups = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      health: async () => ({
        ...health,
        lifecycle: 'stopping',
        ready: false,
      }),
      shutdown: async () => {
        shutdowns += 1
        return {
          status: 'accepted',
          instanceId: health.instanceId,
          acceptedAt: '2026-07-18T00:00:01.000Z',
          alreadyStopping: true,
          observationTimeoutMs: 5000,
        }
      },
      cleanupStale: () => {
        cleanups += 1
        return 'busy'
      },
    }),
  )
  expect(await lifecycle.stop()).toMatchObject({
    status: 'stopped',
    instanceId: health.instanceId,
  })
  expect(shutdowns).toBe(1)
  expect(cleanups).toBe(0)
})

test('live stop uses graceful RPC shutdown and reports the settled instance', async () => {
  let shutdowns = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      shutdown: async () => {
        shutdowns += 1
        return {
          status: 'accepted',
          instanceId: health.instanceId,
          acceptedAt: '2026-07-18T00:00:01.000Z',
          alreadyStopping: false,
          observationTimeoutMs: 5000,
        }
      },
    }),
  )
  expect(await lifecycle.stop()).toEqual({
    status: 'stopped',
    alreadyStopped: false,
    instanceId: health.instanceId,
  })
  expect(shutdowns).toBe(1)
})

test('live stop bounds a shutdown request that never settles', async () => {
  const timeout = new AbortController()
  timeout.abort()
  let timeoutCalls = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      timeoutSignal: () => {
        timeoutCalls += 1
        return timeoutCalls === 1
          ? new AbortController().signal
          : timeout.signal
      },
      shutdown: async () => new Promise(() => {}),
    }),
  )
  await expect(lifecycle.stop()).rejects.toThrow(
    'did not complete graceful shutdown',
  )
})

test('stale cleanup refuses to claim completion while lifecycle remains busy', async () => {
  const lifecycle = createDaemonLifecycle(
    dependencies({
      health: async () => {
        throw new Error('unreachable')
      },
      cleanupStale: () => 'busy',
    }),
  )
  await expect(lifecycle.stop()).rejects.toThrow('still owns lifecycle state')
})

test('stale cleanup failures do not expose host paths or raw errors', async () => {
  const lifecycle = createDaemonLifecycle(
    dependencies({
      health: async () => {
        throw new Error('unreachable')
      },
      cleanupStale: () => {
        throw new Error('unlink /private/secret/ctxindex.sock EACCES')
      },
    }),
  )
  try {
    await lifecycle.stop()
    throw new Error('expected stop to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('could not be cleaned safely')
    expect((error as Error).message).not.toContain('/private/secret')
    expect((error as Error).message).not.toContain('EACCES')
  }
})

test('stale endpoint cleanup fails closed on a regular file', () => {
  const root = mkdtempSync(join(tmpdir(), 'ctxindex-stale-endpoint-'))
  cleanup.push(root)
  const path = join(root, 'ctxd-aaaaaaaaaaaaaaaaaaaaaaaa.sock')
  writeFileSync(path, 'not a socket')
  expect(() => removeStaleDaemonEndpoint(path)).toThrow('unsafe')
})

test('unsupported platforms report status and reject start without launch', async () => {
  let launches = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      supported: () => false,
      launch: () => {
        launches += 1
      },
    }),
  )
  expect(await lifecycle.status()).toEqual({ status: 'unsupported' })
  await expect(lifecycle.start()).rejects.toThrow(
    'unsupported on this platform',
  )
  expect(launches).toBe(0)
})

test('unreachable test override never launches a daemon', async () => {
  let launches = 0
  const lifecycle = createDaemonLifecycle(
    dependencies({
      select: () => ({
        ...selection,
        metadata: null,
        selectedBy: 'test_override',
      }),
      health: async () => {
        throw new Error('unreachable')
      },
      launch: () => {
        launches += 1
      },
    }),
  )
  await expect(lifecycle.start()).rejects.toThrow('test endpoint')
  expect(launches).toBe(0)
})
