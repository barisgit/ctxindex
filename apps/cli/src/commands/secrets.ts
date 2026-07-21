import type { SecretBackend } from '@ctxindex/core/secrets'
import { defineCtxCommand } from '../command-model'
import {
  daemonSecretsBackendSet,
  daemonSecretsStatus,
  selectDaemon,
} from '../daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { openSecretDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { outputFormatArg } from '../format/output'
import {
  formatSecretBackendStatus,
  formatSecretBackendSwitch,
} from '../format/secrets'

export type SecretsCommandInput =
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'set'; readonly target: SecretBackend }

export interface SecretsCommandDeps {
  readonly selectDaemon: typeof selectDaemon
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly secretsStatus: typeof daemonSecretsStatus
  readonly secretsBackendSet: typeof daemonSecretsBackendSet
  readonly open: typeof openSecretDeps
}

const defaultDeps: SecretsCommandDeps = {
  selectDaemon,
  ensureDaemonSelection,
  secretsStatus: daemonSecretsStatus,
  secretsBackendSet: daemonSecretsBackendSet,
  open: openSecretDeps,
}

export async function handleSecretsCommand(
  parsed: SecretsCommandInput,
  services: SecretsCommandDeps = defaultDeps,
): Promise<number> {
  let deps: Awaited<ReturnType<typeof openSecretDeps>> | undefined
  const controller = new AbortController()
  const cancel = () => controller.abort()
  process.once('SIGINT', cancel)
  try {
    const daemon = await selectEnsuredDaemonRoute(services, controller.signal)
    if (parsed.kind === 'status') {
      console.log(
        formatSecretBackendStatus(
          daemon
            ? await services.secretsStatus(daemon, controller.signal)
            : await (async () => {
                deps = await services.open()
                return deps.secretBackendManager.getStatus()
              })(),
          parsed.json,
        ),
      )
      return 0
    }

    const result = daemon
      ? await services.secretsBackendSet(
          daemon,
          { target: parsed.target },
          controller.signal,
        )
      : await (async () => {
          deps = await services.open()
          return deps.secretBackendManager.switchBackend(parsed.target)
        })()
    console.log(formatSecretBackendSwitch(result))
    for (const warning of result.warnings) console.error(`warning: ${warning}`)
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  } finally {
    process.removeListener('SIGINT', cancel)
    await deps?.close()
  }
}

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
