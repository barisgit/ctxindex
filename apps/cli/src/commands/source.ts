import { compareStrings, type SourceDescription } from '@ctxindex/core/registry'
import { defineCommand } from 'citty'
import { loadCliDefinitions } from '../definitions'
import { runWithExit } from '../format/exit'
import { handleSourceCommand } from '../source/handle-source-command'

const sourceOptionArgs = {
  realm: { type: 'string', description: 'Realm slug' },
  format: { type: 'string', description: 'Output format: table or compact' },
  json: { type: 'boolean', description: 'Print JSON' },
} as const

export function generatedSourceConfigArgs(
  sources: readonly SourceDescription[],
): Record<string, { type: 'string'; description: string }> {
  const byFlag = new Map<string, string[]>()
  for (const source of [...sources].sort((left, right) =>
    compareStrings(left.id, right.id),
  )) {
    for (const option of source.configOptions) {
      const description = `${source.id}: ${option.docs ?? option.property} (${option.type}${option.required ? ', required' : ''}${option.default !== undefined ? `, default ${JSON.stringify(option.default)}` : ''})`
      const flag = option.flag.slice(2)
      byFlag.set(flag, [...(byFlag.get(flag) ?? []), description])
    }
  }
  return Object.fromEntries(
    [...byFlag.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([flag, descriptions]) => [
        flag,
        { type: 'string' as const, description: descriptions.join('; ') },
      ]),
  )
}

export const sourceCommand = defineCommand({
  meta: { name: 'source', description: 'Manage indexed sources.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a source.' },
      args: async () => ({
        adapter: { type: 'string', description: 'Adapter ID' },
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
        ...generatedSourceConfigArgs(
          (await loadCliDefinitions()).description.sources,
        ),
      }),
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
