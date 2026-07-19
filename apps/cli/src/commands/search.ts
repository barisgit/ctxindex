import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import {
  formatSearchJson,
  handleSearchCommand,
} from '../search/handle-search-command'

export { formatSearchJson, handleSearchCommand }

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
    'include-deleted': {
      type: 'boolean',
      description: 'Include deleted local Resources',
    },
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
