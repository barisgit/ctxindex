import { readConfig, writeConfig } from '@ctxindex/core/config'
import { hasFileSecretMaterial } from '@ctxindex/core/secrets'
import { defineCommand } from 'citty'
import { parseSecretsArgs, secretsUsage } from '../args/secrets'
import { openDeps } from '../deps'
import { mapErrorToExit, runWithExit } from '../format/exit'
import { formatSecretsAlready, formatSecretsMigrated } from '../format/secrets'

export async function handleSecretsCommand(args: string[]): Promise<number> {
  const parsed = parseSecretsArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${secretsUsage}`)
    return 2
  }

  try {
    const config = await readConfig()
    if (parsed.target === 'file') {
      const hasMaterial = await hasFileSecretMaterial(
        parsed.passphrase === undefined
          ? {}
          : { passphrase: parsed.passphrase },
      )
      if (!hasMaterial) {
        console.error(
          'ctxindex secrets migrate file requires --passphrase, CTXINDEX_SECRETS_PASSPHRASE, or an existing $XDG_CONFIG_HOME/ctxindex/secret.key file',
        )
        return 2
      }
    }
    if (config.secrets.backend === parsed.target) {
      await writeConfig({
        ...config,
        secrets: { ...config.secrets, backend: parsed.target },
      })
      console.log(formatSecretsAlready(parsed.target))
      return 0
    }
    const deps = await openDeps(
      parsed.passphrase === undefined
        ? {}
        : { filePassphrase: parsed.passphrase },
    )
    const result = await deps.secretsService.migrateSecrets(parsed.target)
    await writeConfig({
      ...config,
      secrets: { ...config.secrets, backend: parsed.target },
    })
    console.log(formatSecretsMigrated(result.moved, parsed.target))
    return 0
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}

export const secretsCommand = defineCommand({
  meta: { name: 'secrets', description: 'Manage secrets backends.' },
  subCommands: {
    migrate: defineCommand({
      meta: { name: 'migrate', description: 'Migrate secrets backend.' },
      args: {
        target: { type: 'positional', required: false },
        passphrase: { type: 'string', description: 'File backend passphrase' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleSecretsCommand(['migrate', ...rawArgs])),
    }),
  },
})
