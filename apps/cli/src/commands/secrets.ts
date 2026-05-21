import {
  type CtxindexConfig,
  readConfig,
  writeConfig,
} from '@ctxindex/core/config'
import {
  CtxindexSecretsError,
  FileBackend,
  type FileBackendOptions,
  hasFileSecretMaterial,
  KeychainBackend,
  loadSecretsStore,
  type SecretBackend,
  type SecretsStore,
} from '@ctxindex/core/secrets'

interface ParsedMigrateArgs {
  readonly backend: SecretBackend
  readonly passphrase?: string
}

function parseMigrateArgs(args: string[]): ParsedMigrateArgs {
  const [backend, ...rest] = args
  if (backend !== 'keychain' && backend !== 'file') {
    throw new CtxindexSecretsError(
      'usage: ctxindex secrets migrate <keychain|file> [--passphrase <passphrase>]',
      'invalid_ref',
    )
  }

  let passphrase: string | undefined
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--passphrase') {
      const value = rest[index + 1]
      if (!value) {
        throw new CtxindexSecretsError(
          '--passphrase requires a value',
          'invalid_ref',
        )
      }
      passphrase = value
      index += 1
    } else if (arg?.startsWith('--passphrase=')) {
      passphrase = arg.slice('--passphrase='.length)
    } else {
      throw new CtxindexSecretsError(`unknown option: ${arg}`, 'invalid_ref')
    }
  }

  return passphrase === undefined ? { backend } : { backend, passphrase }
}

function fileOptions(passphrase?: string): FileBackendOptions {
  return passphrase === undefined
    ? { createKeyFileIfMissing: false }
    : { passphrase, createKeyFileIfMissing: false }
}

async function storeForBackend(
  backend: SecretBackend,
  passphrase?: string,
): Promise<SecretsStore> {
  if (backend === 'file') {
    return new FileBackend(fileOptions(passphrase))
  }
  return new KeychainBackend()
}

async function migrateSecrets(
  config: CtxindexConfig,
  targetBackend: SecretBackend,
  passphrase?: string,
): Promise<number> {
  const currentBackend = config.secrets.backend
  if (targetBackend === 'file') {
    const hasMaterial = await hasFileSecretMaterial(fileOptions(passphrase))
    if (!hasMaterial) {
      console.error(
        'ctxindex secrets migrate file requires --passphrase, CTXINDEX_SECRETS_PASSPHRASE, or an existing $XDG_CONFIG_HOME/ctxindex/secret.key file',
      )
      return 2
    }
  }

  if (currentBackend === targetBackend) {
    await writeConfig({
      ...config,
      secrets: { ...config.secrets, backend: targetBackend },
    })
    console.log(`secrets backend already ${targetBackend}`)
    return 0
  }

  const source = await loadSecretsStore(config, {
    file: fileOptions(passphrase),
  })
  const target = await storeForBackend(targetBackend, passphrase)
  const entries = await source.listKeys()
  const copiedRefs: string[] = []

  for (const entry of entries) {
    const value = await source.getSecret(entry.ref)
    copiedRefs.push(await target.setSecret(entry.scope, entry.key, value))
  }

  for (const entry of entries) {
    await source.deleteSecret(entry.ref)
  }

  await writeConfig({
    ...config,
    secrets: { ...config.secrets, backend: targetBackend },
  })

  console.log(
    `migrated ${copiedRefs.length} secret${copiedRefs.length === 1 ? '' : 's'} to ${targetBackend}`,
  )
  return 0
}

export async function handleSecretsCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args
  if (subcommand !== 'migrate') {
    console.error('usage: ctxindex secrets migrate <keychain|file>')
    return 2
  }

  try {
    const parsed = parseMigrateArgs(rest)
    return await migrateSecrets(
      await readConfig(),
      parsed.backend,
      parsed.passphrase,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    if (err instanceof CtxindexSecretsError && err.code === 'invalid_ref') {
      return 2
    }
    return 1
  }
}
