import type { CtxindexConfig } from '../config'
import { FileBackend, type FileBackendOptions } from './file'
import { KeychainBackend, type KeychainBackendOptions } from './keychain'
import { CtxindexSecretsError, type SecretsStore } from './types'

export interface LoadSecretsStoreOptions {
  readonly file?: FileBackendOptions
  readonly keychain?: KeychainBackendOptions
}

export async function loadSecretsStore(
  config: CtxindexConfig,
  options: LoadSecretsStoreOptions = {},
): Promise<SecretsStore> {
  if (config.secrets.backend === 'file') {
    return new FileBackend(options.file)
  }

  const backend = new KeychainBackend(options.keychain)
  try {
    await backend.assertAvailable()
  } catch (cause) {
    throw new CtxindexSecretsError(
      'keychain backend unavailable; run ctxindex secrets migrate file',
      'backend_unavailable',
      { cause },
    )
  }
  return backend
}
