import {
  getSourceResource,
  type SourceResourceResult,
} from '@ctxindex/core/source'
import type { RpcResourceGetResult } from '@ctxindex/rpc'
import { defineCommand } from 'citty'
import { getUsage, parseGetArgs } from '../args/get'
import { daemonResourceGet, selectDaemon } from '../daemon/client'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type GetResult = SourceResourceResult | RpcResourceGetResult

export function formatGetJson(result: GetResult): string {
  return JSON.stringify(result)
}

export function formatGetText(result: GetResult): string {
  return `${result.resource.ref}${result.resource.title ? `\t${result.resource.title}` : ''}`
}

export interface GetCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly get: typeof daemonResourceGet
  readonly open: typeof openDeps
}

const defaultDeps: GetCommandDeps = {
  selectDaemon,
  get: daemonResourceGet,
  open: openDeps,
}

export async function handleGetCommand(
  args: string[],
  services: GetCommandDeps = defaultDeps,
): Promise<number> {
  const parsed = parseGetArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${getUsage}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<typeof openDeps>> | undefined
  try {
    const daemon = services.selectDaemon()
    const result = daemon
      ? await services.get(daemon, parsed.ref, controller.signal)
      : await (async () => {
          deps = await services.open()
          controller.signal.throwIfAborted()
          const directResult = await getSourceResource({
            db: deps.db,
            ref: parsed.ref,
            registry: deps.registry,
            authService: deps.authService,
            logger: deps.logger,
            signal: controller.signal,
          })
          controller.signal.throwIfAborted()
          return directResult
        })()
    console.log(parsed.json ? formatGetJson(result) : formatGetText(result))
    for (const warning of result.warnings) {
      console.error(`${warning.code}\t${warning.message}`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}

export const getCommand = defineCommand({
  meta: { name: 'get', description: 'Get a Resource by exact Ref.' },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleGetCommand(rawArgs)),
})
