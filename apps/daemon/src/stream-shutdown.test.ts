import { expect, test } from 'bun:test'
import { createDocumentationService } from '@ctxindex/core/documentation'
import type {
  RpcRequestContext,
  RpcRuntimeIdentity,
  RpcSyncEvent,
} from '@ctxindex/rpc'
import { DaemonApplication } from './application'

// Daemon shutdown must settle a stream whose producer is blocked handing off
// an event the client never consumed. The bounded rendezvous holds one event,
// so the producer is parked in `emit` rather than polling its abort signal;
// shutdown has to close the handoff, not only abort the signal, or the drain
// (and with it SQLite and both leases) never completes.

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

function context(requestId: string): RpcRequestContext {
  return {
    requestId,
    signal: new AbortController().signal,
    clientProtocol: { id: 'ctxindex.local', version: 2 },
    clientRuntime: runtime,
  }
}

type SyncRunInput = {
  readonly signal: AbortSignal
  readonly onEvent?: (event: {
    readonly type: 'source.started'
    readonly sequence: number
    readonly sourceId: string
    readonly mode: 'sync'
  }) => Promise<void>
}

function application(run: (input: SyncRunInput) => Promise<typeof syncDone>) {
  return new DaemonApplication({
    protocol: { id: 'ctxindex.local', version: 2 },
    runtime,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'instance-test',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: 123,
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    syncService: { run },
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () => [],
    },
  } as unknown as ConstructorParameters<typeof DaemonApplication>[0])
}

function startedEvent(sequence: number) {
  return {
    type: 'source.started' as const,
    sequence,
    sourceId: 'source-1',
    mode: 'sync' as const,
  }
}

// Resolves to 'timeout' instead of hanging the suite when the drain is stuck.
function withinMs<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

test('explicit shutdown settles a stream blocked handing off an unconsumed event', async () => {
  let producerSignal: AbortSignal | undefined
  let handoff: Promise<'accepted' | 'rejected'> | undefined
  const app = application(async ({ signal, onEvent }) => {
    producerSignal = signal
    await onEvent?.(startedEvent(0))
    // The client never pulls this event, so the producer stays parked here.
    const pending = onEvent?.(startedEvent(1)) ?? Promise.resolve()
    handoff = pending.then(
      () => 'accepted' as const,
      () => 'rejected' as const,
    )
    await pending
    return syncDone
  })
  app.markReady()

  const opened = await app.sync.run({ mode: 'sync' }, context('blocked'))
  if (!opened.ok) throw new Error('Expected stream admission')
  const first = await opened.value.next()
  expect(first.done).toBe(false)
  await Bun.sleep(0)
  expect(handoff).toBeDefined()
  expect(app.activeRequestCount).toBe(1)

  const accepted = await app.system.shutdown({}, context('shutdown'))
  expect(accepted.ok).toBe(true)
  expect(producerSignal?.aborted).toBe(true)

  expect(await withinMs(app.whenDrained(), 1_000)).toBeUndefined()
  expect(await handoff).toBe('rejected')
  expect(app.activeRequestCount).toBe(0)

  // The iterator is finalized with a cancellation, never a late success.
  const terminal = await opened.value.next()
  expect(terminal.done).toBe(true)
  expect(terminal.value).toMatchObject({
    ok: false,
    error: { kind: 'cancelled' },
  })
})

test('a stream that finishes normally settles request tracking exactly once', async () => {
  const app = application(async ({ onEvent }) => {
    await onEvent?.(startedEvent(0))
    return syncDone
  })
  app.markReady()

  const opened = await app.sync.run({ mode: 'sync' }, context('normal'))
  if (!opened.ok) throw new Error('Expected stream admission')
  const events: RpcSyncEvent[] = []
  let step = await opened.value.next()
  while (!step.done) {
    events.push(step.value)
    step = await opened.value.next()
  }
  expect(events).toHaveLength(1)
  expect(step.value).toMatchObject({ ok: true })
  expect(app.activeRequestCount).toBe(0)

  // A second admitted stream proves the tracker was not corrupted by a
  // duplicate settlement, and later shutdown and return stay idempotent.
  const again = await app.sync.run({ mode: 'sync' }, context('normal-2'))
  if (!again.ok) throw new Error('Expected stream admission')
  expect(app.activeRequestCount).toBe(1)
  await again.value.return?.()
  expect(app.activeRequestCount).toBe(0)

  await app.system.shutdown({}, context('shutdown'))
  await opened.value.return?.()
  expect(await withinMs(app.whenDrained(), 1_000)).toBeUndefined()
  expect(app.activeRequestCount).toBe(0)
})
