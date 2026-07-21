import type { SecretBackend } from '@ctxindex/core/secrets'
import { defineCtxCommand } from '../command-model'
import { openSecretDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  formatSecretBackendStatus,
  formatSecretBackendSwitch,
} from '../format/secrets'

export type SecretsCommandInput =
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'set'; readonly target: SecretBackend }

export async function handleSecretsCommand(
  parsed: SecretsCommandInput,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openSecretDeps>> | undefined
  try {
    deps = await openSecretDeps()
    if (parsed.kind === 'status') {
      console.log(
        formatSecretBackendStatus(
          await deps.secretBackendManager.getStatus(),
          parsed.json,
        ),
      )
      return 0
    }

    const result = await deps.secretBackendManager.switchBackend(parsed.target)
    console.log(formatSecretBackendSwitch(result))
    for (const warning of result.warnings) console.error(`warning: ${warning}`)
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  } finally {
    await deps?.close()
  }
}

export const secretsCommand = defineCtxCommand({
  meta: { name: 'secrets', description: 'Inspect and select secret storage.' },
  subCommands: {
    status: defineCtxCommand({
      meta: { name: 'status', description: 'Show safe backend status.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ args }) =>
        runWithExit(() =>
          handleSecretsCommand({ kind: 'status', json: args.json ?? false }),
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
