import { defineCommand } from 'citty'
import { generatedSourceConfigArgs, preflightSourceArgs } from '../args/source'
import { runWithExit } from '../format/exit'
import {
  defaultSourceCommandDeps,
  handleSourceCommand,
  retainSourceCommandRoute,
  type SourceCommandDeps,
  sourceRouteDescriptions,
} from '../source/handle-source-command'

const sourceOptionArgs = {
  realm: { type: 'string', description: 'Realm slug' },
  format: { type: 'string', description: 'Output format: table or compact' },
  json: { type: 'boolean', description: 'Print JSON' },
} as const

export interface SourceCommandRuntime {
  readonly command: ReturnType<typeof defineCommand>
  close(): Promise<void>
  error(): unknown
}

export function createSourceCommandRuntime(
  invocationArgs: string[] = [],
  services: SourceCommandDeps = defaultSourceCommandDeps,
): SourceCommandRuntime {
  const retained = retainSourceCommandRoute(invocationArgs, services)
  const route = retained.resolve
  const activeSourceDescriptions = async () => {
    const preliminary = preflightSourceArgs(invocationArgs)
    const needsDefinitions =
      preliminary.kind === 'needs-definitions' ||
      (preliminary.kind === 'help' && invocationArgs[0] === 'add')
    if (!needsDefinitions) {
      return []
    }
    const activeRoute = await route()
    const descriptions = sourceRouteDescriptions(activeRoute)
    if (preliminary.kind === 'help') await retained.close()
    return descriptions
  }
  const run = (args: string[]) =>
    runWithExit(async () => handleSourceCommand(args, services, await route()))

  const command = defineCommand({
    meta: { name: 'source', description: 'Manage indexed sources.' },
    subCommands: {
      add: defineCommand({
        meta: { name: 'add', description: 'Add a source.' },
        args: async () => ({
          adapter: { type: 'string', description: 'Adapter ID' },
          label: { type: 'string', description: 'Global Source label' },
          account: {
            type: 'string',
            description: 'Account label or Account ID',
          },
          'config-json': { type: 'string', description: 'Adapter config JSON' },
          'search-routing': {
            type: 'string',
            description: 'indexed, federated, or hybrid routing override',
          },
          'no-sync': {
            type: 'boolean',
            description: 'Disable synchronization for this Source',
          },
          'adapter-id': { type: 'positional', required: false },
          realm: sourceOptionArgs.realm,
          ...generatedSourceConfigArgs(await activeSourceDescriptions()),
        }),
        run: ({ rawArgs }) => run(['add', ...rawArgs]),
      }),
      list: defineCommand({
        meta: { name: 'list', description: 'List sources.' },
        args: sourceOptionArgs,
        run: ({ rawArgs }) => run(['list', ...rawArgs]),
      }),
      remove: defineCommand({
        meta: { name: 'remove', description: 'Remove a source.' },
        args: { source: { type: 'positional', required: false } },
        run: ({ rawArgs }) => run(['remove', ...rawArgs]),
      }),
    },
  })
  return { command, close: retained.close, error: retained.error }
}

export function createSourceCommand(
  invocationArgs: string[] = [],
  services: SourceCommandDeps = defaultSourceCommandDeps,
) {
  return createSourceCommandRuntime(invocationArgs, services).command
}

export const sourceCommand = createSourceCommand()
