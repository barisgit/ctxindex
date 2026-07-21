import { handleAccountCommand } from '../account/handle-account-command'
import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { resolveOutputFormat, structuredOutputArgs } from '../format/output'

export const accountCommand = defineCtxCommand({
  meta: { name: 'account', description: 'Authorize and manage Accounts.' },
  subCommands: {
    add: defineCtxCommand({
      meta: {
        name: 'add',
        description: 'Authorize one provider Account.',
      },
      args: {
        provider: { type: 'positional', required: true },
        label: { type: 'string', description: 'Global Account label' },
        app: { type: 'string', description: 'Provider-scoped OAuth App label' },
      },
      run: ({ args }) =>
        runWithExit(() =>
          handleAccountCommand({
            kind: 'add',
            provider: args.provider,
            ...(args.app !== undefined ? { app: args.app } : {}),
            ...(args.label !== undefined ? { label: args.label } : {}),
          }),
        ),
    }),
    list: defineCtxCommand({
      meta: {
        name: 'list',
        description: 'List Accounts with bound Sources.',
      },
      args: structuredOutputArgs,
      run: ({ args }) =>
        runWithExit(() =>
          handleAccountCommand({
            kind: 'list',
            format: resolveOutputFormat(args),
          }),
        ),
    }),
    remove: defineCtxCommand({
      meta: { name: 'remove', description: 'Remove an Account by label.' },
      args: { label: { type: 'positional', required: true } },
      run: ({ args }) =>
        runWithExit(() =>
          handleAccountCommand({ kind: 'remove', label: args.label }),
        ),
    }),
  },
})
