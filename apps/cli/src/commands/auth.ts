import { defineCommand } from 'citty'
import { handleAuthCommand } from '../auth/handle-auth-command'
import { runWithExit } from '../format/exit'

export { handleAuthCommand }
export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Add provider-neutral OAuth Grants.' },
  subCommands: {
    add: defineCommand({
      meta: {
        name: 'add',
        description: 'Authorize selected provider Adapters.',
      },
      args: {
        provider: { type: 'positional', required: false },
        adapter: { type: 'string', description: 'Adapter id (repeatable)' },
        'client-id': { type: 'string', description: 'Public OAuth client id' },
        label: { type: 'string', description: 'Account label' },
        loopback: {
          type: 'boolean',
          description: 'Use loopback authorization',
        },
        'from-env': {
          type: 'boolean',
          description: 'Use the declared refresh-token environment value',
        },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAuthCommand(['add', ...rawArgs])),
    }),
  },
})
