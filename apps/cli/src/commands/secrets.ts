import { defineCtxCommand } from '../command-model'
import { runWithExit } from '../format/exit'
import { outputFormatArg } from '../format/output'
import { handleSecretsCommand } from '../secrets/handle-secrets-command'

export {
  handleSecretsCommand,
  type SecretsCommandDeps,
  type SecretsCommandInput,
} from '../secrets/handle-secrets-command'

export const secretsCommand = defineCtxCommand({
  meta: { name: 'secrets', description: 'Inspect and select secret storage.' },
  subCommands: {
    status: defineCtxCommand({
      meta: { name: 'status', description: 'Show safe backend status.' },
      args: { format: outputFormatArg },
      run: ({ args }) =>
        runWithExit(() =>
          handleSecretsCommand({
            kind: 'status',
            json: args.format === 'json',
          }),
        ),
    }),
    backend: defineCtxCommand({
      meta: { name: 'backend', description: 'Manage the active backend.' },
      subCommands: {
        set: defineCtxCommand({
          meta: { name: 'set', description: 'Set keychain or file backend.' },
          args: {
            target: {
              type: 'positional',
              required: true,
              options: ['keychain', 'file'],
            },
          },
          run: ({ args }) =>
            runWithExit(() =>
              handleSecretsCommand({
                kind: 'set',
                target: args.target,
              }),
            ),
        }),
      },
    }),
  },
})
