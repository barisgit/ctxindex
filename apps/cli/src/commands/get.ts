import {
  getSourceResource,
  type SourceResourceResult,
} from '@ctxindex/core/source'
import { defineCommand } from 'citty'
import { getUsage, parseGetArgs } from '../args/get'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

export function formatGetJson(result: SourceResourceResult): string {
  return JSON.stringify(result)
}

export function formatGetText(result: SourceResourceResult): string {
  return `${result.resource.ref}${result.resource.title ? `\t${result.resource.title}` : ''}`
}

export async function handleGetCommand(args: string[]): Promise<number> {
  const parsed = parseGetArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${getUsage}`)
    return 2
  }

  const deps = await openDeps()
  try {
    const result = await getSourceResource({
      db: deps.db,
      ref: parsed.ref,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
      signal: new AbortController().signal,
    })
    console.log(parsed.json ? formatGetJson(result) : formatGetText(result))
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

export const getCommand = defineCommand({
  meta: { name: 'get', description: 'Get a Resource by exact Ref.' },
  args: {
    ref: { type: 'positional', required: false, description: 'Resource Ref' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleGetCommand(rawArgs)),
})
