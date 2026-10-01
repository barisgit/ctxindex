import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { CtxindexValidationError } from '@ctxindex/core/errors'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import { handleActionCommand } from '../../../apps/cli/src/action/handle-action-command'
import {
  type DaemonSelection,
  daemonActionDescribe,
  daemonActionRun,
  daemonRealmAdd,
  daemonRealmList,
  selectDaemonForRuntime,
} from '../../../apps/cli/src/daemon/client'
import type { DaemonSelectionEnsureResult } from '../../../apps/cli/src/daemon/ensure'
import { handleRealmCommand } from '../../../apps/cli/src/realm/handle-realm-command'
import {
  DaemonApplication,
  type DaemonApplicationOptions,
} from '../../../apps/daemon/src/application'
import { DAEMON_PROTOCOL } from '../../../apps/daemon/src/runtime'
import { ByteTransferStore } from '../../../apps/daemon/src/transfer'
import { bindDaemonTransport } from '../../../apps/daemon/src/transport'

// Integrated CLI ensure/client coverage for the bounded stopping race: real
// DaemonApplication admission over the real Unix-socket transport, the real
// CLI daemon client, and real command handlers. Only the lifecycle ensure is a
// stub so the test controls when the old owner releases and a replacement
// becomes ready.

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function runtimeRoot() {
  const root = await mkdtemp('/tmp/ctxi-ensure-race-')
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const runtime = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  })
  return { root, runtime }
}

type Runtime = Awaited<ReturnType<typeof runtimeRoot>>

function startDaemon(
  { root, runtime }: Runtime,
  instanceId: string,
  services: Partial<DaemonApplicationOptions>,
) {
  const endpoint = join(root, `${instanceId}.sock`)
  const transferStore = new ByteTransferStore()
  const application = new DaemonApplication({
    protocol: DAEMON_PROTOCOL,
    runtime: runtime.identity,
    daemonVersion: '0.0.0',
    buildVersion: 'ensure-race',
    instanceId,
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: process.pid,
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    syncService: {
      run: async () => ({
        mode: 'sync',
        results: [],
        skipped: [],
        warnings: [],
      }),
    },
    sourceService: { resolveSourceId: (value) => value, getStatus: () => [] },
    transferStore,
    ...services,
  })
  application.markReady()
  const listener = bindDaemonTransport({
    endpoint,
    application,
    expectations: { protocol: DAEMON_PROTOCOL, runtime: runtime.identity },
    transferStore,
  })
  let stopped = false
  const release = async () => {
    if (stopped) return
    stopped = true
    await listener.stop()
  }
  cleanups.push(release)
  const selection = selectDaemonForRuntime(runtime, { testEndpoint: endpoint })
  if (!selection) throw new Error('Expected explicit test endpoint')
  return { application, selection, release }
}

type Daemon = ReturnType<typeof startDaemon>

// Mirrors lifecycle ensure: the first call observes the old owner; a retry
// waits for that owner to release before the replacement becomes ready.
function stoppingRaceEnsure(old: Daemon, replacement: () => Daemon) {
  const calls: string[] = []
  const ensure = async (): Promise<DaemonSelectionEnsureResult> => {
    calls.push(calls.length === 0 ? 'old' : 'replacement')
    if (calls.length === 1) {
      return { status: 'selected', selection: old.selection, started: false }
    }
    await old.release()
    return {
      status: 'selected',
      selection: replacement().selection,
      started: true,
    }
  }
  return { ensure, calls }
}

function quietConsole() {
  const stdout: string[] = []
  const stderr: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value: unknown) => {
    stdout.push(String(value))
  })
  const error = spyOn(console, 'error').mockImplementation((value: unknown) => {
    stderr.push(String(value))
  })
  cleanups.push(() => {
    log.mockRestore()
    error.mockRestore()
  })
  return { stdout, stderr }
}

function realmServices(ensure: () => Promise<DaemonSelectionEnsureResult>) {
  return {
    selectDaemon: (): DaemonSelection | null => null,
    ensureDaemonSelection: ensure,
    realmAdd: daemonRealmAdd,
    realmList: daemonRealmList,
    open: async () => {
      throw new Error('an ensured command must not open direct state')
    },
  }
}

test('a declared stopping rejection waits for the replacement owner and invokes once', async () => {
  const runtime = await runtimeRoot()
  const invocations: string[] = []
  const realmService = (instance: string) => ({
    createRealm: () => {
      throw new Error('not used')
    },
    listRealms: () => {
      invocations.push(instance)
      return []
    },
  })
  const old = startDaemon(runtime, 'old', { realmService: realmService('old') })
  old.application.beginStopping()
  let replacement: Daemon | undefined
  const race = stoppingRaceEnsure(old, () => {
    replacement ??= startDaemon(runtime, 'replacement', {
      realmService: realmService('replacement'),
    })
    return replacement
  })
  const output = quietConsole()

  const code = await handleRealmCommand(
    { kind: 'list', format: 'json' },
    realmServices(race.ensure),
  )

  expect({ code, stderr: output.stderr }).toEqual({ code: 0, stderr: [] })
  expect(race.calls).toEqual(['old', 'replacement'])
  expect(invocations).toEqual(['replacement'])
})

test('an admitted request interrupted by stopping is never replayed', async () => {
  const runtime = await runtimeRoot()
  const invocations: string[] = []
  let admitted!: () => void
  const wasAdmitted = new Promise<void>((resolve) => {
    admitted = resolve
  })
  const old = startDaemon(runtime, 'old', {
    actionService: {
      describe: () => {
        throw new Error('not used')
      },
      run: async ({ signal }) => {
        invocations.push('old')
        admitted()
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        )
        throw new Error('unreachable')
      },
    },
  })
  const race = stoppingRaceEnsure(old, () => {
    throw new Error('possibly executed work must not reconnect')
  })
  quietConsole()

  const pending = handleActionCommand(
    {
      kind: 'run',
      actionId: 'fixture.action',
      sourceId: 'fixture',
      input: '{}',
      json: true,
    },
    async () => {
      throw new Error('an ensured command must not open direct state')
    },
    {
      describe: () => {
        throw new Error('direct describe must not run')
      },
      run: async () => {
        throw new Error('direct run must not run')
      },
      ensureDaemonSelection: race.ensure,
      daemonDescribe: daemonActionDescribe,
      daemonRun: daemonActionRun,
    },
  )
  await wasAdmitted
  old.application.beginStopping()

  expect(await pending).toBe(130)
  expect(race.calls).toEqual(['old'])
  expect(invocations).toEqual(['old'])
})

for (const kind of ['describe', 'run'] as const) {
  test(`Action ${kind} reconnects once after a declared pre-admission rejection`, async () => {
    const runtime = await runtimeRoot()
    const invocations: string[] = []
    const actionService = (instance: string) => ({
      describe: () => {
        invocations.push(instance)
        throw new CtxindexValidationError('unknown_action', 'Unknown Action')
      },
      run: async () => {
        invocations.push(instance)
        throw new CtxindexValidationError('unknown_action', 'Unknown Action')
      },
    })
    const old = startDaemon(runtime, 'old', {
      actionService: actionService('old'),
    })
    old.application.beginStopping()
    let replacement: Daemon | undefined
    const race = stoppingRaceEnsure(old, () => {
      replacement ??= startDaemon(runtime, 'replacement', {
        actionService: actionService('replacement'),
      })
      return replacement
    })
    const output = quietConsole()

    const code = await handleActionCommand(
      kind === 'run'
        ? {
            kind,
            actionId: 'fixture.action',
            sourceId: 'fixture',
            input: '{}',
            json: true,
          }
        : { kind, actionId: 'fixture.action', sourceId: 'fixture', json: true },
      async () => {
        throw new Error('an ensured command must not open direct state')
      },
      {
        describe: () => {
          throw new Error('direct describe must not run')
        },
        run: async () => {
          throw new Error('direct run must not run')
        },
        ensureDaemonSelection: race.ensure,
        daemonDescribe: daemonActionDescribe,
        daemonRun: daemonActionRun,
      },
    )

    // The replacement admitted and ran the procedure exactly once; its domain
    // failure keeps the stable validation exit rather than unavailability.
    expect({ code, stderr: output.stderr }).toEqual({
      code: 2,
      stderr: ['Unknown Action'],
    })
    expect(race.calls).toEqual(['old', 'replacement'])
    expect(invocations).toEqual(['replacement'])
  })
}
