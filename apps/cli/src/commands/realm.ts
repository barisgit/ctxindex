import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import { handleRealmCommand } from '../realm/handle-realm-command'

export { handleRealmCommand }

export const realmCommand = defineCommand({
  meta: { name: 'realm', description: 'Manage indexing realms.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a realm.' },
      args: {
        slug: { type: 'positional', required: false },
        name: { type: 'string', description: 'Realm display name' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleRealmCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List existing realms.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleRealmCommand(['list', ...rawArgs])),
    }),
  },
})
