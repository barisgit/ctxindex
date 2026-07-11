import { defineCommand } from 'citty'
import { handleAuthCommand } from '../auth/handle-auth-command'
import { runWithExit } from '../format/exit'

export { handleAuthCommand }

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Manage Google OAuth grants.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a Google OAuth grant.' },
      args: {
        provider: { type: 'positional', required: false },
        'client-id': { type: 'string', description: 'OAuth client ID' },
        'client-secret': { type: 'string', description: 'OAuth secret' },
        'auth-code': { type: 'string', description: 'OAuth code' },
        'refresh-token': { type: 'string', description: 'Refresh token' },
        label: { type: 'string', description: 'Grant label' },
        loopback: { type: 'boolean', description: 'Use loopback OAuth' },
        'from-env': { type: 'boolean', description: 'Read creds from env' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAuthCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List Google OAuth grants.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAuthCommand(['list', ...rawArgs])),
    }),
  },
})
