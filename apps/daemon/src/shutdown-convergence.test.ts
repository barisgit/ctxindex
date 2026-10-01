import { expect, spyOn, test } from 'bun:test'
import type { FileLease } from '@ctxindex/local-daemon'
import { type StartDaemonOptions, startDaemon } from './runtime'
import { createSignalHandler } from './signals'

// Idle expiry, explicit `system.shutdown`, and a termination signal must all
// converge on one graceful shutdown: one stopping publication, one SQLite
// close, and one release of each retained lease, in the established order.

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
}

const IDLE_TIMEOUT_MS = 1_000
const syncDone = {
  mode: 'sync' as const,
  results: [],
  skipped: [],
  warnings: [],
}

function lease(name: string, events: string[]): FileLease {
  return {
    mode: 'exclusive',
    targetDigest: name.padEnd(64, '0'),
    release: () => events.push(`release:${name}`),
  }
}

function daemonOptions(input: {
  readonly name: string
  readonly clock: TestIdleClock
  readonly events: string[]
  readonly syncRun?: () => Promise<typeof syncDone>
  readonly writeMetadata?: (lifecycle: string) => void
}): StartDaemonOptions {
  const { events } = input
  return {
    roots: {
      configRoot: `/tmp/ctxd-${input.name}-config`,
      dataRoot: `/tmp/ctxd-${input.name}-data`,
      stateRoot: `/tmp/ctxd-${input.name}-state`,
      cacheRoot: `/tmp/ctxd-${input.name}-cache`,
    },
    endpointRuntimeRoot: `/tmp/ctxd-${input.name}-runtime`,
    leaseBackend: { acquire: (request) => lease(request.purpose, events) },
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    idleTimer: input.clock.hooks,
    observationTimeoutMs: 5,
    hooks: {
      readMatchingMetadata: () => null,
      assertDatabaseTarget: () => {},
      readConfig: async () => ({}) as never,
      readInstalled: async () => ({ records: [], diagnostics: [] }),
      loadExtensions: async () => ({
        registry: {} as never,
        completeRegistry: {} as never,
        provenance: [],
        diagnostics: [],
        documentation: { list: () => [], get: () => undefined },
      }),
      openDatabase: async () =>
        ({ close: () => events.push('close:db') }) as never,
      runMigrations: async () => {},
      listLocalOAuthAppIdentities: () => [],
      composeServices: () => ({
        syncService: { run: input.syncRun ?? (async () => syncDone) },
        sourceService: {
          resolveSourceId: (value: string) => value,
          getStatus: () => [],
        },
      }),
      bind: () => ({
        stop: () => {
          events.push('close:listener')
        },
      }),
      writeMetadata: (_root, metadata) => {
        input.writeMetadata?.(metadata.lifecycle)
        events.push(`metadata:${metadata.lifecycle}`)
      },
      cleanupMetadata: () => {
        events.push('cleanup:metadata')
        return 'removed'
      },
      removeEndpoint: () => events.push('cleanup:endpoint'),
    },
  }
}

const finalization = [
  'metadata:stopping',
  'close:db',
  'close:listener',
  'cleanup:metadata',
  'cleanup:endpoint',
  'release:database',
  'release:lifecycle',
]

const noExit = (): never => {
  throw new Error('A single signal must not force-terminate')
}

type Trigger = 'idle' | 'explicit' | 'signal'

const orders: readonly (readonly Trigger[])[] = [
  ['idle', 'explicit', 'signal'],
  ['idle', 'signal', 'explicit'],
  ['explicit', 'idle', 'signal'],
  ['explicit', 'signal', 'idle'],
  ['signal', 'idle', 'explicit'],
  ['signal', 'explicit', 'idle'],
]

test.each(
  orders.map((order) => [order.join(' -> '), order] as const),
)('%s shutdown triggers converge on one graceful finalization', async (_name, order) => {
  const clock = new TestIdleClock()
  const events: string[] = []
  const daemon = await startDaemon(
    daemonOptions({ name: `converge-${order.join('-')}`, clock, events }),
  )
  const signal = createSignalHandler(daemon, noExit)
  events.length = 0

  const accepted: boolean[] = []
  for (const trigger of order) {
    if (trigger === 'idle') clock.advance(IDLE_TIMEOUT_MS)
    if (trigger === 'signal') signal('SIGTERM')
    if (trigger === 'explicit') {
      const result = await daemon.application.system.shutdown(
        {},
        daemon.testContext(),
      )
      if (!result.ok) throw new Error('Expected shutdown acceptance')
      accepted.push(result.value.alreadyStopping)
    }
    expect(daemon.application.lifecycle).toBe('stopping')
  }

  await daemon.closed
  expect(await daemon.close()).toEqual({ status: 'complete' })
  expect(events).toEqual(finalization)
  expect(accepted).toEqual([order[0] !== 'explicit'])
  expect(clock.pending).toBe(0)
})

test('ownership stays retained through shutdown timeout until admitted work settles', async () => {
  const clock = new TestIdleClock()
  const events: string[] = []
  let settle!: () => void
  const daemon = await startDaemon(
    daemonOptions({
      name: 'timeout-ownership',
      clock,
      events,
      // Non-cooperative work ignores cancellation until the test settles it.
      syncRun: () =>
        new Promise((resolve) => {
          settle = () => resolve(syncDone)
        }),
    }),
  )
  const errors = spyOn(console, 'error').mockImplementation(() => {})
  try {
    events.length = 0
    const opened = await daemon.application.sync.run(
      { mode: 'sync' },
      daemon.testContext(),
    )
    if (!opened.ok) throw new Error('Expected stream admission')
    const terminal = opened.value.next()

    const accepted = await daemon.application.system.shutdown(
      {},
      daemon.testContext(),
    )
    expect(accepted.ok).toBe(true)
    createSignalHandler(daemon, noExit)('SIGTERM')
    expect(await daemon.close(5)).toEqual({
      status: 'timeout',
      instanceId: daemon.instanceId,
      timeoutMs: 5,
    })
    clock.advance(10 * IDLE_TIMEOUT_MS)
    await Bun.sleep(10)

    // Timeouts report back, but SQLite and both leases stay owned.
    expect(events).toEqual(['metadata:stopping'])
    expect(errors).toHaveBeenCalledWith(
      'Daemon shutdown timed out; ownership remains held until work settles or the process is force-terminated.',
    )

    settle()
    await terminal
    await daemon.closed
    expect(events).toEqual(finalization)
    expect(clock.pending).toBe(0)
  } finally {
    errors.mockRestore()
  }
})

test('a startup failure after readiness leaves no idle timer or ownership behind', async () => {
  const clock = new TestIdleClock()
  const events: string[] = []
  await expect(
    startDaemon(
      daemonOptions({
        name: 'startup-failure',
        clock,
        events,
        writeMetadata: (lifecycle) => {
          if (lifecycle === 'ready') throw new Error('metadata write failed')
        },
      }),
    ),
  ).rejects.toThrow('metadata write failed')

  expect(clock.pending).toBe(0)
  clock.advance(10 * IDLE_TIMEOUT_MS)
  await Bun.sleep(0)
  expect(events.filter((event) => event.startsWith('release:'))).toEqual([
    'release:database',
    'release:lifecycle',
  ])
  expect(events.filter((event) => event === 'close:db')).toHaveLength(1)
  expect(events).not.toContain('metadata:stopping')
})
