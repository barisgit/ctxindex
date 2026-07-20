import { defineCommand } from 'citty'
import { handleAccountCommand } from '../account/handle-account-command'
import { runWithExit } from '../format/exit'

export const accountCommand = defineCommand({
  meta: { name: 'account', description: 'Authorize and manage Accounts.' },
  subCommands: {
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Authorize one provider Account.',
      },
      args: {
        provider: { type: 'positional', required: false },
        label: { type: 'string', description: 'Global Account label' },
        app: { type: 'string', description: 'Provider-scoped OAuth App label' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAccountCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: {
        name: 'list',
        description: 'List Accounts with bound Sources.',
      },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAccountCommand(['list', ...rawArgs])),
    }),
    remove: defineCommand({
      meta: { name: 'remove', description: 'Remove an Account by label.' },
      args: { label: { type: 'positional', required: false } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAccountCommand(['remove', ...rawArgs])),
    }),
  },
})
