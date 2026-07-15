import {
  type ExportResourceInput,
  type ExportResourceResult,
  exportSourceResource,
} from '@ctxindex/core/export'
import { defineCommand } from 'citty'
import { exportUsage, parseExportArgs } from '../args/export'
import { type CliDeps, openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

type OpenExportDeps = () => Promise<
  Pick<CliDeps, 'db' | 'registry' | 'authService' | 'logger' | 'close'>
>
type RunExport = (input: ExportResourceInput) => Promise<ExportResourceResult>

export async function handleExportCommand(
  args: string[],
  open: OpenExportDeps = openDeps,
  runExport: RunExport = exportSourceResource,
): Promise<number> {
  const parsed = parseExportArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${exportUsage}`)
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

export const exportCommand = defineCommand({
  meta: {
    name: 'export',
    description: 'Export a Resource in a Profile format.',
  },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    format: { type: 'string', description: 'Export format' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleExportCommand(rawArgs)),
})
