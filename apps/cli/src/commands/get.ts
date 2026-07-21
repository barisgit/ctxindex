import { parseRef } from '@ctxindex/core'
import {
  getSourceResource,
  type SourceResourceResult,
} from '@ctxindex/core/source'
import type { RpcResourceGetResult } from '@ctxindex/rpc'
import { defineCtxCommand } from '../command-model'
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

export interface GetCommandInput {
  readonly ref: string
  readonly json: boolean
}

const defaultDeps: GetCommandDeps = {
  selectDaemon,
  get: daemonResourceGet,
  open: openDeps,
}

export async function handleGetCommand(
  parsed: GetCommandInput,
  services: GetCommandDeps = defaultDeps,
): Promise<number> {
  try {
    parseRef(parsed.ref)
  } catch {
    console.error(`get: invalid <ref>: ${parsed.ref}`)
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

export const getCommand = defineCtxCommand({
  meta: { name: 'get', description: 'Get a Resource by exact Ref.' },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleGetCommand({ ref: args.ref, json: args.json ?? false }),
    ),
})
