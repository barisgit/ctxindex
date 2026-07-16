import { defineCommand } from 'citty'
import { parseSecretsArgs, secretsUsage } from '../args/secrets'
import { openSecretDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  formatSecretBackendStatus,
  formatSecretBackendSwitch,
} from '../format/secrets'

export async function handleSecretsCommand(args: string[]): Promise<number> {
  const parsed = parseSecretsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${secretsUsage}`)
    return 2
  }

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

export const secretsCommand = defineCommand({
  meta: { name: 'secrets', description: 'Inspect and select secret storage.' },
  subCommands: {
    status: defineCommand({
      meta: { name: 'status', description: 'Show safe backend status.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSecretsCommand(['status', ...rawArgs])),
    }),
    backend: defineCommand({
      meta: { name: 'backend', description: 'Manage the active backend.' },
      subCommands: {
        set: defineCommand({
          meta: { name: 'set', description: 'Set keychain or file backend.' },
          args: {
            target: { type: 'positional', required: true },
          },
          run: ({ rawArgs }) =>
            runWithExit(() =>
              handleSecretsCommand(['backend', 'set', ...rawArgs]),
            ),
        }),
      },
    }),
  },
})
