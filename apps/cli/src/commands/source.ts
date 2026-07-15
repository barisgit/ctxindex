import { CtxindexValidationError } from '@ctxindex/core/errors'
import { defineCommand } from 'citty'
import { parseSourceArgs, sourceUsage } from '../args/source'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  formatSourceAdded,
  formatSourceRemoved,
  formatSources,
} from '../format/source'
import { resolveSourceGrant } from '../source/resolve-source-grant'

function printOutput(output: string): void {
  if (output.length > 0) console.log(output)
}

export async function handleSourceCommand(args: string[]): Promise<number> {
  const parsed = parseSourceArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${sourceUsage}`)
    return 2
  }

  try {
    const deps = await openDeps()
    if (parsed.kind === 'add') {
      const adapter = deps.registry.adapters
        .list()
        .filter((candidate) => candidate.id === parsed.adapterId)
        .sort((left, right) => right.version - left.version)[0]
      if (!adapter) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `Unknown adapter: ${parsed.adapterId}`,
        )
      }
      let config: unknown
      try {
        config = JSON.parse(parsed.configJson ?? '{}')
      } catch {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}@${adapter.version}`,
        )
      }
      const validatedConfig = adapter.configSchema.safeParse(config)
      if (!validatedConfig.success) {
        throw new CtxindexValidationError(
          'invalid_filter',
          `invalid config for Adapter ${adapter.id}@${adapter.version}`,
        )
      }
      const grantId = await resolveSourceGrant(
        deps.authService,
        adapter.auth,
        parsed.account,
      )
      const { sourceId } = deps.sourceService.addSource({
        adapterId: parsed.adapterId,
        adapterVersion: adapter.version,
        ...(parsed.realmSlug ? { realmSlug: parsed.realmSlug } : {}),
        ...(parsed.displayName ? { displayName: parsed.displayName } : {}),
        configJson: JSON.stringify(validatedConfig.data),
        ...(grantId ? { grantId } : {}),
        ...(parsed.searchRouting
          ? { searchRouting: parsed.searchRouting }
          : {}),
      })
      console.log(formatSourceAdded(sourceId))
    } else if (parsed.kind === 'list') {
      printOutput(formatSources(deps.sourceService.listSources(parsed), parsed))
    } else {
      deps.sourceService.removeSource(parsed.sourceId)
      console.log(formatSourceRemoved(parsed.sourceId))
    }
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

const sourceOptionArgs = {
  realm: { type: 'string', description: 'Realm slug' },
  format: { type: 'string', description: 'Output format: table or compact' },
  json: { type: 'boolean', description: 'Print JSON' },
} as const

export const sourceCommand = defineCommand({
  meta: { name: 'source', description: 'Manage indexed sources.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a source.' },
      args: {
        adapter: { type: 'string', description: 'Adapter ID' },
        root: { type: 'string', description: 'Local root path' },
        path: { type: 'string', description: 'Local root path' },
        name: { type: 'string', description: 'Source name' },
        'display-name': { type: 'string', description: 'Display name' },
        account: {
          type: 'string',
          description: 'Account email or grant ID (required when ambiguous)',
        },
        'config-json': { type: 'string', description: 'Adapter config JSON' },
        'search-routing': {
          type: 'string',
          description: 'indexed, federated, or hybrid routing override',
        },
        'adapter-id': { type: 'positional', required: false },
        realm: sourceOptionArgs.realm,
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSourceCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List sources.' },
      args: sourceOptionArgs,
      run: ({ rawArgs }) =>
        runWithExit(() => handleSourceCommand(['list', ...rawArgs])),
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove a source.' },
      args: { 'source-id': { type: 'positional', required: false } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSourceCommand(['remove', ...rawArgs])),
    }),
  },
})
