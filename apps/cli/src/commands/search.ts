import { SearchPlanner } from '@ctxindex/core/search'
import { defineCommand } from 'citty'
import { parseSearchArgs, searchUsage } from '../args/search'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'

export function formatSearchJson(
  result: Awaited<ReturnType<SearchPlanner['search']>>,
): string {
  return JSON.stringify(result)
}

export async function handleSearchCommand(args: string[]): Promise<number> {
  const parsed = parseSearchArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${searchUsage}`)
    return 2
  }

  const deps = await openDeps()
  try {
    const sourceIds = parsed.input.sourceIds?.map((source) =>
      deps.sourceService.resolveSourceId(source),
    )
    const result = await new SearchPlanner({
      db: deps.db,
      registry: deps.registry,
      authService: deps.authService,
      logger: deps.logger,
    }).search({
      ...parsed.input,
      ...(sourceIds ? { sourceIds } : {}),
    })
    if (parsed.json) {
      console.log(formatSearchJson(result))
    } else if (parsed.refs) {
      for (const item of result.results) console.log(item.ref)
    } else {
      for (const item of result.results) {
        console.log(`${item.ref}${item.title ? `\t${item.title}` : ''}`)
      }
      for (const warning of result.warnings) {
        console.error(
          `${warning.sourceId}\t${warning.code}\t${warning.message}`,
        )
      }
      if (result.explain) console.error(JSON.stringify(result.explain))
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  } finally {
    await deps.close()
  }
}

export const searchCommand = defineCommand({
  meta: { name: 'search', description: 'Search context Resources.' },
  args: {
    query: { type: 'positional', required: false, description: 'Query text' },
    realm: { type: 'string', description: 'Exact Realm slug' },
    adapter: { type: 'string', description: 'Adapter ID' },
    source: { type: 'string', description: 'Exact Source label or ID' },
    kind: { type: 'string', description: 'Profile kind or alias' },
    field: { type: 'string', description: 'Typed equality filter name=value' },
    since: { type: 'string', description: 'Start ISO date' },
    until: { type: 'string', description: 'End ISO date' },
    limit: { type: 'string', description: 'Result limit' },
    offset: { type: 'string', description: 'Local pagination offset' },
    refs: { type: 'boolean', description: 'Print Resource Refs only' },
    'local-only': {
      type: 'boolean',
      description: 'Search local projections only',
    },
    remote: {
      type: 'boolean',
      description: 'Search remote-capable Sources only',
    },
    explain: { type: 'boolean', description: 'Explain per-Source routing' },
    json: { type: 'boolean', description: 'Print deterministic JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleSearchCommand(rawArgs)),
})
