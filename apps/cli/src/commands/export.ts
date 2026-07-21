import { parseRef } from '@ctxindex/core'
import {
  type ExportResourceInput,
  type ExportResourceResult,
  exportSourceResource,
} from '@ctxindex/core/export'
import { defineCtxCommand } from '../command-model'
import { type CliDeps, openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenExportDeps = () => Promise<
  Pick<CliDeps, 'db' | 'registry' | 'authService' | 'logger' | 'close'>
>
type RunExport = (input: ExportResourceInput) => Promise<ExportResourceResult>

export interface ExportCommandInput {
  readonly ref: string
  readonly format: string
}

export async function handleExportCommand(
  parsed: ExportCommandInput,
  open: OpenExportDeps = openDeps,
  runExport: RunExport = exportSourceResource,
): Promise<number> {
  try {
    parseRef(parsed.ref)
  } catch {
    console.error(`export: invalid <ref>: ${parsed.ref}`)
    return 2
  }

  const deps = await open()
  try {
    const result = await runExport({
      db: deps.db,
      ref: parsed.ref,
      format: parsed.format,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
      signal: new AbortController().signal,
    })
    process.stdout.write(result.bytes)
    for (const warning of result.warnings) {
      console.error(`${warning.code}\t${warning.message}`)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps.close()
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
