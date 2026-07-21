import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { handleOAuthAppCommand } from '../oauth-app/handle-oauth-app-command'

export const oauthAppCommand = defineCtxCommand({
  meta: { name: 'oauth-app', description: 'Manage available OAuth Apps.' },
  subCommands: {
    add: defineCtxCommand({
      meta: {
        name: 'add',
        description: 'Add a local OAuth App from declared environment values.',
      },
      args: {
        provider: { type: 'positional', required: true },
        label: { type: 'positional', required: true },
        'from-env': {
          type: 'boolean',
          required: true,
          description: 'Read Provider-declared environment values',
        },
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleOAuthAppCommand({
            kind: 'add',
            provider: args.provider,
            label: args.label,
          }),
        ),
    }),
    list: defineCtxCommand({
      meta: { name: 'list', description: 'List available OAuth Apps.' },
      args: { json: { type: 'boolean', description: 'Output JSON' } },
      run: ({ args }) =>
        runWithExit(() =>
          handleOAuthAppCommand({ kind: 'list', json: args.json ?? false }),
        ),
    }),
    remove: defineCtxCommand({
      meta: { name: 'remove', description: 'Remove a local OAuth App.' },
      args: {
        provider: { type: 'positional', required: true },
        label: { type: 'positional', required: true },
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleOAuthAppCommand({
            kind: 'remove',
            provider: args.provider,
            label: args.label,
          }),
        ),
    }),
  },
})
