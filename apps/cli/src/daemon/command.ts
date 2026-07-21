import { defineCtxCommand } from '../command-model'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  type DaemonLifecycle,
  type DaemonStartResult,
  type DaemonStatusResult,
  type DaemonStopResult,
  daemonStart,
  daemonStatus,
  daemonStop,
} from './lifecycle'

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function printStart(result: DaemonStartResult, json: boolean): void {
  if (json) {
    printJson(result)
    return
  }
  console.log(
    `running\tstarted=${result.started}\tinstance=${result.health.instanceId}\tpid=${result.health.pid}\tprotocol=${result.health.protocol.id}@${result.health.protocol.version}`,
  )
}

function printStatus(result: DaemonStatusResult, json: boolean): void {
  if (json) {
    printJson(result)
    return
  }
  if (result.status === 'running') {
    console.log(
      `running\tready=${result.health.ready}\tinstance=${result.health.instanceId}\tpid=${result.health.pid}\tprotocol=${result.health.protocol.id}@${result.health.protocol.version}\tactive=${result.health.activeRequestCount}`,
    )
    return
  }
  if (
    result.status === 'starting' ||
    result.status === 'stopping' ||
    result.status === 'unavailable'
  ) {
    console.log(
      `${result.status}\tinstance=${result.instanceId}\tpid=${result.pid}\tstarted=${result.startedAt}`,
    )
    return
  }
  console.log(result.status)
}

function printStop(result: DaemonStopResult, json: boolean): void {
  if (json) {
    printJson(result)
    return
  }
  if (result.status === 'unsupported') {
    console.log('unsupported')
    return
  }
  console.log(
    `stopped\talreadyStopped=${result.alreadyStopped}${result.instanceId ? `\tinstance=${result.instanceId}` : ''}`,
  )
}

export type DaemonCommandInput =
  | { readonly kind: 'start'; readonly json: boolean }
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'stop'; readonly json: boolean }

const defaultLifecycle: DaemonLifecycle = {
  start: daemonStart,
  status: daemonStatus,
  stop: daemonStop,
}

export async function handleDaemonCommand(
  parsed: DaemonCommandInput,
  lifecycle: DaemonLifecycle = defaultLifecycle,
): Promise<number> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    if (parsed.kind === 'start') {
      printStart(await lifecycle.start(controller.signal), parsed.json)
    } else if (parsed.kind === 'status') {
      printStatus(await lifecycle.status(controller.signal), parsed.json)
    } else {
      printStop(await lifecycle.stop(controller.signal), parsed.json)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
  }
}

const jsonArgs = {
  json: { type: 'boolean' as const, description: 'Print JSON' },
}

export const daemonCommand = defineCtxCommand({
  meta: { name: 'daemon', description: 'Manage the background local daemon.' },
  subCommands: {
    start: defineCtxCommand({
      meta: { name: 'start', description: 'Start the background daemon.' },
      args: jsonArgs,
      run: ({ args }) =>
        runWithExit(() =>
          handleDaemonCommand({ kind: 'start', json: args.json ?? false }),
        ),
    }),
    status: defineCtxCommand({
      meta: {
        name: 'status',
        description: 'Inspect daemon lifecycle and health.',
      },
      args: jsonArgs,
      run: ({ args }) =>
        runWithExit(() =>
          handleDaemonCommand({ kind: 'status', json: args.json ?? false }),
        ),
    }),
    stop: defineCtxCommand({
      meta: {
        name: 'stop',
        description: 'Stop the background daemon gracefully.',
      },
      args: jsonArgs,
      run: ({ args }) =>
        runWithExit(() =>
          handleDaemonCommand({ kind: 'stop', json: args.json ?? false }),
        ),
    }),
  },
})
