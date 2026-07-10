import { defineCommand } from 'citty'
import { parseSearchArgs, searchUsage } from '../args/search'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatSearch } from '../format/search'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export async function handleSearchCommand(args: string[]): Promise<number> {
  const parsed = parseSearchArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${searchUsage}`)
    return 2
  }

  try {
    const deps = await openDeps()
    const result = deps.searchService.executeSearch(parsed.input)
    printOutput(formatSearch(result, parsed))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

export const searchCommand = defineCommand({
  meta: { name: 'search', description: 'Search indexed content.' },
  args: {
    query: { type: 'positional', required: false, description: 'Query text' },
    realm: { type: 'string', description: 'Realm slug' },
    provider: { type: 'string', description: 'Provider filter' },
    adapter: { type: 'string', description: 'Adapter filter' },
    source: { type: 'string', description: 'Source ID' },
    mime: { type: 'string', description: 'MIME pattern' },
    kind: { type: 'string', description: 'Kind filter' },
    since: { type: 'string', description: 'Start ISO date' },
    until: { type: 'string', description: 'End ISO date' },
    limit: { type: 'string', description: 'Result limit' },
    'snippet-chars': { type: 'string', description: 'Snippet character limit' },
    format: { type: 'string', description: 'Output format' },
    refs: { type: 'boolean', description: 'Print item references only' },
    'include-deleted': {
      type: 'boolean',
      description: 'Include deleted items',
    },
    explain: { type: 'boolean', description: 'Explain scoring' },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ rawArgs }) => runWithExit(() => handleSearchCommand(rawArgs)),
})
