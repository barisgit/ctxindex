import { defineCommand } from 'citty'
import { handleClientCommand } from '../client/handle-client-command'
import { runWithExit } from '../format/exit'

export const clientCommand = defineCommand({
  meta: { name: 'client', description: 'Manage persisted OAuth clients.' },
  subCommands: {
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Add an OAuth client from environment values.',
      },
      args: {
        provider: { type: 'positional', required: false },
        label: { type: 'string', description: 'Provider-scoped client label' },
        'from-env': {
          type: 'boolean',
          description: 'Read declared environment values',
        },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleClientCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List configured OAuth clients.' },
      run: ({ rawArgs }) =>
        runWithExit(() => handleClientCommand(['list', ...rawArgs])),
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove an OAuth client.' },
      args: {
        provider: { type: 'positional', required: false },
        label: { type: 'positional', required: false },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleClientCommand(['remove', ...rawArgs])),
    }),
  },
})
