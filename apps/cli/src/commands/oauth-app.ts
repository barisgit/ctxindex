import { defineCommand } from 'citty'
import { runWithExit } from '../format/exit'
import { handleOAuthAppCommand } from '../oauth-app/handle-oauth-app-command'

export const oauthAppCommand = defineCommand({
  meta: { name: 'oauth-app', description: 'Manage available OAuth Apps.' },
  subCommands: {
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Add a local OAuth App from declared environment values.',
      },
      args: {
        provider: { type: 'positional', required: false },
        label: { type: 'positional', required: false },
        'from-env': {
          type: 'boolean',
          description: 'Read Provider-declared environment values',
        },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleOAuthAppCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List available OAuth Apps.' },
      args: { json: { type: 'boolean', description: 'Output JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleOAuthAppCommand(['list', ...rawArgs])),
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove a local OAuth App.' },
      args: {
        provider: { type: 'positional', required: false },
        label: { type: 'positional', required: false },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleOAuthAppCommand(['remove', ...rawArgs])),
    }),
  },
})
