import { parseRef } from '@ctxindex/core'
import { getSourceResource } from '@ctxindex/core/source'
import { defineCtxCommand } from '../command-model'
import { daemonResourceGet, selectDaemon } from '../daemon/client'
import {
  type DaemonRouteSelector,
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  type OutputFormat,
  resolveOutputFormat,
  structuredOutputArgs,
} from '../format/output'
import {
  formatGetJson,
  formatGetPretty,
  formatGetText,
} from '../format/resource'

export { formatGetJson, formatGetPretty, formatGetText }

export interface GetCommandDeps extends DaemonRouteSelector {
  readonly get: typeof daemonResourceGet
  readonly open: typeof openDeps
}

export type GetCommandInput = {
  readonly ref: string
  readonly format: OutputFormat
}

const defaultDeps: GetCommandDeps = {
  selectDaemon,
  ensureDaemonSelection,
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
    const daemon = await selectEnsuredDaemonRoute(services, controller.signal)
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
    console.log(
      parsed.format === 'json'
        ? formatGetJson(result)
        : parsed.format === 'pretty'
          ? formatGetPretty(result)
          : formatGetText(result),
    )
    if (parsed.format !== 'json') {
      for (const warning of result.warnings) {
        console.error(`${warning.code}\t${warning.message}`)
      }
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
    ...structuredOutputArgs,
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleGetCommand({ ref: args.ref, format: resolveOutputFormat(args) }),
    ),
})
