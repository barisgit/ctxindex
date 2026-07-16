import { configPath, defaultConfig, readConfig, writeConfig } from '../config'
import { FileBackend, type FileBackendOptions } from './file'
import { KeychainBackend, type KeychainBackendOptions } from './keychain'
import type { SecretBackend } from './types'

export interface InitializeSecretBackendOptions {
  readonly filePath?: string
  readonly file?: FileBackendOptions
  readonly keychain?: KeychainBackendOptions
}

export async function initializeSecretBackend(
  options: InitializeSecretBackendOptions = {},
): Promise<SecretBackend> {
  const filePath = options.filePath ?? configPath()
  if (await Bun.file(filePath).exists()) {
    return (await readConfig(filePath)).secrets.backend
  }

  let backend: SecretBackend
  try {
    await new KeychainBackend(options.keychain).probeAvailable()
    backend = 'keychain'
  } catch {
    await new FileBackend(options.file).probeAvailable()
    backend = 'file'
  }

  const config = defaultConfig()
  await writeConfig({ ...config, secrets: { backend } }, filePath)
  return backend
}
