import { accessSync, constants, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { defineCommand } from 'citty'
import { daemonUsage, parseDaemonArgs } from '../args/daemon'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  type DaemonSelection,
  daemonHealth,
  daemonShutdown,
  requireDaemonSelection,
} from './client'

function printHealth(
  health: Awaited<ReturnType<typeof daemonHealth>>,
  json: boolean,
): void {
  if (json) {
    console.log(JSON.stringify(health, null, 2))
    return
  }
  console.log(
    `${health.lifecycle}\tready=${health.ready}\tinstance=${health.instanceId}\tprotocol=${health.protocol.id}@${health.protocol.version}\tactive=${health.activeRequestCount}`,
  )
}

function printShutdown(instanceId: string, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ status: 'complete', instanceId }, null, 2))
    return
  }
  console.log(`shutdown complete\tinstance=${instanceId}`)
}

export interface DaemonLaunchResolutionOptions {
  readonly sourceMode?: boolean
  readonly processExecutable?: string
  readonly compiledDaemonOverride?: string
}

export function resolveDaemonLaunch(
  options: DaemonLaunchResolutionOptions = {},
): string[] {
  const processExecutable = options.processExecutable ?? process.execPath
  const sourceMode = options.sourceMode ?? basename(processExecutable) === 'bun'
  if (sourceMode) {
    return [
      processExecutable,
      join(import.meta.dir, '..', '..', '..', 'daemon', 'src', 'main.ts'),
    ]
  }
  const executable =
    options.compiledDaemonOverride ??
    process.env.CTXINDEX_DAEMON_EXECUTABLE ??
    join(dirname(processExecutable), 'ctxindex-daemon')
  try {
    if (!isAbsolute(executable) || !statSync(executable).isFile()) throw null
    accessSync(executable, constants.X_OK)
  } catch {
    throw new Error(
      'The compiled daemon executable is unavailable beside ctxindex.',
    )
  }
  return [executable]
}

async function serveForeground(): Promise<number> {
  const launch = resolveDaemonLaunch()
  const child = Bun.spawn(launch, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  })
  const forwardInterrupt = () => child.kill('SIGINT')
  const forwardTerminate = () => child.kill('SIGTERM')
  process.once('SIGINT', forwardInterrupt)
  process.once('SIGTERM', forwardTerminate)
  try {
    return await child.exited
  } finally {
    process.removeListener('SIGINT', forwardInterrupt)
    process.removeListener('SIGTERM', forwardTerminate)
  }
}

export interface DaemonCommandDeps {
  readonly select: typeof requireDaemonSelection
  readonly health: typeof daemonHealth
  readonly shutdown: typeof daemonShutdown
  readonly serve: () => Promise<number>
}

const defaultDeps: DaemonCommandDeps = {
  select: requireDaemonSelection,
  health: daemonHealth,
  shutdown: daemonShutdown,
  serve: serveForeground,
}

export async function handleDaemonCommand(
  args: string[],
  deps: DaemonCommandDeps = defaultDeps,
): Promise<number> {
  const parsed = parseDaemonArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${daemonUsage}`)
    return 2
  }
  if (parsed.kind === 'serve') return deps.serve()

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    const selection: DaemonSelection = deps.select()
    if (parsed.kind === 'health') {
      printHealth(await deps.health(selection, controller.signal), parsed.json)
    } else {
      const accepted = await deps.shutdown(selection, controller.signal)
      printShutdown(accepted.instanceId, parsed.json)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
  }
}

export const daemonCommand = defineCommand({
  meta: { name: 'daemon', description: 'Manage the foreground local daemon.' },
  subCommands: {
    serve: defineCommand({
      meta: { name: 'serve', description: 'Serve in the foreground.' },
      run: ({ rawArgs }) =>
        runWithExit(() => handleDaemonCommand(['serve', ...rawArgs])),
    }),
    health: defineCommand({
      meta: { name: 'health', description: 'Inspect daemon health.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleDaemonCommand(['health', ...rawArgs])),
    }),
    shutdown: defineCommand({
      meta: { name: 'shutdown', description: 'Request graceful shutdown.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleDaemonCommand(['shutdown', ...rawArgs])),
    }),
  },
})
