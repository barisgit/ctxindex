import { describe, expect, test } from 'bun:test'
import { createDocumentationService } from '@ctxindex/core/documentation'
import type {
  RpcRequestContext,
  RpcResult,
  RpcRuntimeIdentity,
  RpcSyncResult,
} from '@ctxindex/rpc'
import { DaemonApplication } from './application'

// Deterministic idle-lifetime tests. Business activity is owned by the
// application's request tracker: the idle timer is armed only while no business
// request is admitted, and one fresh interval starts after the final settlement.

const digest = 'a'.repeat(64)
const runtime: RpcRuntimeIdentity = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
}

const syncDone = {
  mode: 'sync' as const,
  results: [],
  skipped: [],
  warnings: [],
}

function context(
  requestId: string,
  signal = new AbortController().signal,
): RpcRequestContext {
  return {
    requestId,
    signal,
    clientProtocol: { id: 'ctxindex.local', version: 4 },
    clientRuntime: runtime,
  }
}

class TestIdleClock {
  now = 0
  #nextId = 0
  readonly #timers = new Map<
    number,
    { readonly deadline: number; readonly callback: () => void }
  >()

  readonly hooks = {
    now: () => this.now,
    setTimeout: (callback: () => void, delayMs: number): number => {
      const id = this.#nextId++
      this.#timers.set(id, { deadline: this.now + delayMs, callback })
      return id
    },
    clearTimeout: (id: unknown): void => {
      if (typeof id === 'number') this.#timers.delete(id)
    },
  }

  /** Number of armed (not yet fired or cleared) idle timer handles. */
  get pending(): number {
    return this.#timers.size
  }

  advance(milliseconds: number): void {
    this.now += milliseconds
    while (true) {
      const due = [...this.#timers.entries()]
        .filter(([, timer]) => timer.deadline <= this.now)
        .sort((left, right) => left[1].deadline - right[1].deadline)[0]
      if (!due) return
      this.#timers.delete(due[0])
      due[1].callback()
    }
  }

  takeDue(): () => void {
    const due = [...this.#timers.entries()]
      .filter(([, timer]) => timer.deadline <= this.now)
      .sort((left, right) => left[1].deadline - right[1].deadline)[0]
    if (!due) throw new Error('Expected a due timer')
    this.#timers.delete(due[0])
    return due[1].callback
  }
}

function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

const secretStatus = {
  backend: 'file' as const,
  backends: {
    file: { available: true, referenceCount: 0 },
    keychain: { available: false, referenceCount: 0 },
  },
}

function idleApplication(
  clock: TestIdleClock,
  idleTimeoutMs: number,
  overrides: Record<string, unknown> = {},
) {
  const stops: number[] = []
  const app = new DaemonApplication({
    protocol: { id: 'ctxindex.local', version: 4 },
    runtime,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'instance-idle',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: 123,
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    idleTimeoutMs,
    idleTimer: clock.hooks,
    onStopping: () => stops.push(clock.now),
    syncService: { run: async () => syncDone },
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () => [],
    },
    ...overrides,
  })
  return { app, stops }
}

/** Unary business work (secret status) whose completion the test controls. */
function controlledUnary() {
  const calls: {
    readonly gate: ReturnType<typeof deferred<void>>
    signal?: AbortSignal
  }[] = []
  return {
    calls,
    secretBackendManager: {
      getStatus: async () => {
        const gate = deferred<void>()
        calls.push({ gate })
        await gate.promise
        return secretStatus
      },
    },
  }
}

/** Asserts one fresh idle interval starts at the current clock time. */
function expectFreshInterval(
  clock: TestIdleClock,
  app: DaemonApplication,
  stops: number[],
  idleTimeoutMs: number,
) {
  const settledAt = clock.now
  expect(app.activeRequestCount).toBe(0)
  expect(clock.pending).toBe(1)
  clock.advance(idleTimeoutMs - 1)
  expect(app.lifecycle).toBe('ready')
  clock.advance(1)
  expect(app.lifecycle).toBe('stopping')
  expect(stops).toEqual([settledAt + idleTimeoutMs])
  expect(clock.pending).toBe(0)
}

describe('activity-aware idle lifetime', () => {
  test('the idle interval begins at readiness and expires exactly once', () => {
    const clock = new TestIdleClock()
    const { app, stops } = idleApplication(clock, 1_000)
    expect(clock.pending).toBe(0)

    app.markReady()
    expectFreshInterval(clock, app, stops, 1_000)

    clock.advance(10_000)
    expect(stops).toEqual([1_000])
  })

  test('admission disarms the idle timer and only the final overlapping settlement rearms it', async () => {
    const clock = new TestIdleClock()
    const unary = controlledUnary()
    const { app, stops } = idleApplication(clock, 1_000, {
      secretBackendManager: unary.secretBackendManager,
    })
    app.markReady()

    clock.advance(100)
    const first = app.secrets.status({}, context('overlap-first'))
    expect(clock.pending).toBe(0)
    clock.advance(100)
    const second = app.secrets.status({}, context('overlap-second'))
    await Bun.sleep(0)
    expect(unary.calls).toHaveLength(2)

    clock.advance(300)
    unary.calls[0]?.gate.resolve()
    expect((await first).ok).toBe(true)
    // Another business request is still active: no idle timer may be armed.
    expect(app.activeRequestCount).toBe(1)
    expect(clock.pending).toBe(0)

    clock.advance(5_000)
    expect(app.lifecycle).toBe('ready')
    unary.calls[1]?.gate.resolve()
    expect((await second).ok).toBe(true)

    expectFreshInterval(clock, app, stops, 1_000)
  })

  test('unary business work beyond five minutes is neither stopped nor cancelled', async () => {
    const clock = new TestIdleClock()
    const unary = controlledUnary()
    const fiveMinutes = 5 * 60_000
    const { app, stops } = idleApplication(clock, fiveMinutes, {
      secretBackendManager: unary.secretBackendManager,
    })
    app.markReady()
    clock.advance(fiveMinutes - 1)

    const pending = app.secrets.status({}, context('long-unary'))
    await Bun.sleep(0)
    clock.advance(3 * fiveMinutes)
    expect(app.lifecycle).toBe('ready')
    expect(stops).toEqual([])

    unary.calls[0]?.gate.resolve()
    expect(await pending).toEqual({ ok: true, value: secretStatus })
    expectFreshInterval(clock, app, stops, fiveMinutes)
  })

  test('Source status.get is business activity that starts a fresh interval after settlement', async () => {
    const clock = new TestIdleClock()
    const { app, stops } = idleApplication(clock, 1_000)
    app.markReady()
    clock.advance(900)

    expect((await app.status.get({}, context('source-status'))).ok).toBe(true)

    expectFreshInterval(clock, app, stops, 1_000)
  })

  test('health probes do not extend the idle interval', async () => {
    const clock = new TestIdleClock()
    const { app, stops } = idleApplication(clock, 1_000)
    app.markReady()

    for (let step = 0; step < 9; step++) {
      clock.advance(100)
      expect((await app.system.health({}, context('probe'))).ok).toBe(true)
    }
    expect(clock.pending).toBe(1)
    clock.advance(100)

    expect(app.lifecycle).toBe('stopping')
    expect(stops).toEqual([1_000])
  })

  test('admission that wins the race with a due expiry keeps the daemon ready', async () => {
    const clock = new TestIdleClock()
    const unary = controlledUnary()
    const { app, stops } = idleApplication(clock, 1_000, {
      secretBackendManager: unary.secretBackendManager,
    })
    app.markReady()
    clock.advance(1_000 - 1)
    clock.now += 1
    // The expiry callback is due but has not run yet when a request arrives.
    const staleExpiry = clock.takeDue()

    const pending = app.secrets.status({}, context('race-admitted'))
    staleExpiry()
    expect(app.lifecycle).toBe('ready')
    await Bun.sleep(0)
    unary.calls[0]?.gate.resolve()
    expect((await pending).ok).toBe(true)
    staleExpiry()

    expectFreshInterval(clock, app, stops, 1_000)
  })

  test('expiry atomically closes admission before any later business request runs', async () => {
    const clock = new TestIdleClock()
    let invoked = 0
    const { app, stops } = idleApplication(clock, 1_000, {
      sourceService: {
        resolveSourceId: (value: string) => value,
        getStatus: () => {
          invoked += 1
          return []
        },
      },
    })
    app.markReady()
    clock.advance(1_000)
    expect(stops).toEqual([1_000])

    expect(await app.status.get({}, context('after-expiry'))).toEqual({
      ok: false,
      error: {
        kind: 'daemon_unavailable',
        code: 'daemon_unavailable',
        message: 'The daemon is stopping and is not accepting new work.',
      },
    })
    const stream = await app.sync.run({ mode: 'sync' }, context('stream'))
    expect(stream.ok).toBe(false)
    expect(invoked).toBe(0)
    expect(app.activeRequestCount).toBe(0)
    expect(clock.pending).toBe(0)
  })

  test('unary domain failure and cancellation each settle activity once', async () => {
    const clock = new TestIdleClock()
    let calls = 0
    const { app, stops } = idleApplication(clock, 1_000, {
      secretBackendManager: {
        getStatus: async () => {
          calls += 1
          throw new Error('backend unavailable')
        },
      },
      sourceService: {
        resolveSourceId: (value: string) => value,
        getStatus: () => [],
      },
    })
    app.markReady()

    clock.advance(400)
    expect((await app.secrets.status({}, context('failure'))).ok).toBe(false)
    expect(calls).toBe(1)
    expect(clock.pending).toBe(1)

    clock.advance(400)
    const request = new AbortController()
    request.abort()
    expect(
      await app.status.get({}, context('cancelled', request.signal)),
    ).toMatchObject({ ok: false, error: { kind: 'cancelled' } })

    expectFreshInterval(clock, app, stops, 1_000)
  })

  test('shutdown with admitted work drains it without rearming the idle timer', async () => {
    const clock = new TestIdleClock()
    const unary = controlledUnary()
    const { app, stops } = idleApplication(clock, 1_000, {
      secretBackendManager: unary.secretBackendManager,
    })
    app.markReady()
    const pending = app.secrets.status({}, context('draining'))
    await Bun.sleep(0)

    await app.system.shutdown({}, context('stop'))
    unary.calls[0]?.gate.resolve()
    expect(await pending).toMatchObject({
      ok: false,
      error: { kind: 'cancelled' },
    })
    await app.whenDrained()

    expect(app.activeRequestCount).toBe(0)
    expect(clock.pending).toBe(0)
    clock.advance(10_000)
    expect(stops).toEqual([0])
  })

  test('explicit shutdown before expiry stops immediately and cancels the idle deadline', async () => {
    const clock = new TestIdleClock()
    const { app, stops } = idleApplication(clock, 1_000)
    app.markReady()
    clock.advance(500)

    const accepted = await app.system.shutdown({}, context('explicit-stop'))
    expect(accepted.ok && accepted.value.alreadyStopping).toBe(false)
    expect(app.lifecycle).toBe('stopping')
    expect(stops).toEqual([500])
    expect(clock.pending).toBe(0)

    clock.advance(10_000)
    expect(stops).toEqual([500])
  })
})

type SyncRunInput = {
  readonly signal: AbortSignal
  readonly onEvent?: (event: {
    readonly type: 'source.started'
    readonly sequence: number
    readonly sourceId: string
    readonly mode: 'sync'
  }) => Promise<void>
}

/** Rejects when aborted so stream cleanup models a cooperative producer. */
function abortable<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject)
  })
}

const idleTimeoutMs = 1_000

function expectHeldAcrossIdle(
  clock: TestIdleClock,
  app: DaemonApplication,
  stops: number[],
) {
  // Admission disarmed the idle timer; nothing may be armed while active.
  expect(clock.pending).toBe(0)
  clock.advance(3 * idleTimeoutMs)
  expect(app.lifecycle).toBe('ready')
  expect(app.activeRequestCount).toBe(1)
  expect(stops).toEqual([])
  expect(clock.pending).toBe(0)
}

function streamApplication(
  clock: TestIdleClock,
  run: (input: SyncRunInput) => Promise<typeof syncDone>,
) {
  return idleApplication(clock, idleTimeoutMs, { syncService: { run } })
}

const startedEvent = {
  type: 'source.started' as const,
  sequence: 0,
  sourceId: 'source-1',
  mode: 'sync' as const,
}

async function openStream(
  app: DaemonApplication,
  signal = new AbortController().signal,
) {
  const opened = await app.sync.run({ mode: 'sync' }, context('stream', signal))
  if (!opened.ok) throw new Error('Expected stream admission')
  return opened.value
}

async function drain(
  iterator: AsyncIteratorObject<unknown, RpcResult<RpcSyncResult>, void>,
): Promise<RpcResult<RpcSyncResult>> {
  while (true) {
    const step = await iterator.next()
    if (step.done) return step.value
  }
}

const cancelled: RpcResult<RpcSyncResult> = {
  ok: false,
  error: {
    kind: 'cancelled',
    code: 'cancelled',
    message: 'The request was cancelled.',
  },
}

describe('typed stream idle suppression and exactly-once settlement', () => {
  test('slow production holds the daemon until the terminal result is consumed', async () => {
    const clock = new TestIdleClock()
    const gate = deferred<void>()
    const { app, stops } = streamApplication(clock, async ({ signal }) => {
      await abortable(signal, gate.promise)
      return syncDone
    })
    app.markReady()
    const iterator = await openStream(app)
    const terminal = drain(iterator)
    await Bun.sleep(0)

    expectHeldAcrossIdle(clock, app, stops)
    gate.resolve()
    expect(await terminal).toEqual({ ok: true, value: syncDone })

    expectFreshInterval(clock, app, stops, idleTimeoutMs)
  })

  test('backpressured consumption holds the daemon until the consumer finishes', async () => {
    const clock = new TestIdleClock()
    let accepted = false
    const { app, stops } = streamApplication(clock, async ({ onEvent }) => {
      await onEvent?.(startedEvent)
      accepted = true
      return syncDone
    })
    app.markReady()
    const iterator = await openStream(app)
    await Bun.sleep(0)

    // The producer is blocked on the one-item handoff; nobody is consuming.
    expectHeldAcrossIdle(clock, app, stops)
    expect(accepted).toBe(false)

    const first = await iterator.next()
    expect(first).toEqual({ done: false, value: startedEvent })
    expect(app.activeRequestCount).toBe(1)
    expect(await drain(iterator)).toEqual({ ok: true, value: syncDone })
    expect(accepted).toBe(true)

    expectFreshInterval(clock, app, stops, idleTimeoutMs)
  })

  test('request cancellation settles activity once after the producer stops', async () => {
    const clock = new TestIdleClock()
    const gate = deferred<void>()
    const { app, stops } = streamApplication(clock, async ({ signal }) => {
      await abortable(signal, gate.promise)
      return syncDone
    })
    app.markReady()
    const request = new AbortController()
    const iterator = await openStream(app, request.signal)
    const terminal = drain(iterator)
    await Bun.sleep(0)
    expectHeldAcrossIdle(clock, app, stops)

    request.abort()
    expect(await terminal).toEqual(cancelled)
    await app.whenDrained()

    expectFreshInterval(clock, app, stops, idleTimeoutMs)
  })

  test('client disconnect of an abandoned stream settles activity once', async () => {
    const clock = new TestIdleClock()
    const { app, stops } = streamApplication(clock, async ({ onEvent }) => {
      await onEvent?.(startedEvent)
      return syncDone
    })
    app.markReady()
    // Transport disconnect aborts the request signal; the client never reads
    // again, so cleanup must not depend on further iterator calls.
    const connection = new AbortController()
    await openStream(app, connection.signal)
    await Bun.sleep(0)
    expectHeldAcrossIdle(clock, app, stops)

    connection.abort()
    await app.whenDrained()

    expectFreshInterval(clock, app, stops, idleTimeoutMs)
  })

  test('early iterator return settles activity once', async () => {
    const clock = new TestIdleClock()
    const gate = deferred<void>()
    const { app, stops } = streamApplication(
      clock,
      async ({ signal, onEvent }) => {
        await onEvent?.(startedEvent)
        await abortable(signal, gate.promise)
        return syncDone
      },
    )
    app.markReady()
    const iterator = await openStream(app)
    expect(await iterator.next()).toEqual({ done: false, value: startedEvent })
    expectHeldAcrossIdle(clock, app, stops)

    expect(await iterator.return?.()).toEqual({ done: true, value: cancelled })
    const settledAt = clock.now
    // A repeated return after settlement must not settle activity again or
    // restart the idle interval.
    clock.advance(idleTimeoutMs / 2)
    expect(await iterator.return?.()).toEqual({ done: true, value: cancelled })
    expect(await iterator.next()).toMatchObject({ done: true })
    clock.advance(idleTimeoutMs / 2 - 1)
    expect(app.lifecycle).toBe('ready')
    clock.advance(1)
    expect(app.lifecycle).toBe('stopping')
    expect(stops).toEqual([settledAt + idleTimeoutMs])
    expect(clock.pending).toBe(0)
  })

  test('producer failure settles activity once after the declared failure is consumed', async () => {
    const clock = new TestIdleClock()
    const gate = deferred<void>()
    const { app, stops } = streamApplication(clock, async () => {
      await gate.promise
      throw new Error('provider exploded')
    })
    app.markReady()
    const iterator = await openStream(app)
    const terminal = drain(iterator)
    await Bun.sleep(0)
    expectHeldAcrossIdle(clock, app, stops)

    gate.resolve()
    const result = await terminal
    expect(result.ok).toBe(false)

    expectFreshInterval(clock, app, stops, idleTimeoutMs)
  })
})
