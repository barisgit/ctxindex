import { parseRef } from '@ctxindex/core'
import {
  type ExportResourceInput,
  type ExportResourceResult,
  exportSourceResource,
} from '@ctxindex/core/export'
import { defineCtxCommand } from '../command-model'
import { daemonExport, selectDaemon } from '../daemon/client'
import {
  type DaemonRouteSelector,
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { type CliDeps, openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenExportDeps = () => Promise<
  Pick<CliDeps, 'db' | 'registry' | 'authService' | 'logger' | 'close'>
>
type RunExport = (input: ExportResourceInput) => Promise<ExportResourceResult>

export interface ExportCommandDeps extends DaemonRouteSelector {
  readonly export: typeof daemonExport
  readonly open: OpenExportDeps
  readonly runExport: RunExport
}

const defaultDeps: ExportCommandDeps = {
  selectDaemon,
  ensureDaemonSelection,
  export: daemonExport,
  open: openDeps,
  runExport: exportSourceResource,
}

export interface ExportCommandInput {
  readonly ref: string
  readonly format: string
}

export async function handleExportCommand(
  parsed: ExportCommandInput,
  services: ExportCommandDeps = defaultDeps,
): Promise<number> {
  try {
    parseRef(parsed.ref)
  } catch {
    console.error(`export: invalid <ref>: ${parsed.ref}`)
    return 2
  }

  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  let deps: Awaited<ReturnType<OpenExportDeps>> | undefined
  try {
    const daemon = await selectEnsuredDaemonRoute(services, controller.signal)
    const result = daemon
      ? await services.export(daemon, parsed, controller.signal)
      : await (async () => {
          deps = await services.open()
          controller.signal.throwIfAborted()
          return services.runExport({
            db: deps.db,
            ref: parsed.ref,
            format: parsed.format,
            registry: deps.registry,
            authService: deps.authService,
            logger: deps.logger,
            signal: controller.signal,
          })
        })()
    controller.signal.throwIfAborted()
    process.stdout.write(result.bytes)
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

export const exportCommand = defineCtxCommand({
  meta: {
    name: 'export',
    description: 'Export a Resource in a Profile format.',
  },
  args: {
    ref: { type: 'positional', required: true, description: 'Resource Ref' },
    format: {
      type: 'string',
      required: true,
      alias: 'f',
      description: 'Export format',
    },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleExportCommand({ ref: args.ref, format: args.format }),
    ),
})
