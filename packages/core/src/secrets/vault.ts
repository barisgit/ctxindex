import type { SecretBackend, SecretsStore } from './types'
import { parseSecretRef } from './types'

export interface SecretVaultDeps {
  readonly backend: SecretBackend
  readonly fileStore: SecretsStore
  readonly keychainStore: SecretsStore
}

export interface SecretVault extends SecretsStore {
  readonly backend: SecretBackend
}

function storeForBackend(
  deps: SecretVaultDeps,
  backend: SecretBackend,
): SecretsStore {
  return backend === 'file' ? deps.fileStore : deps.keychainStore
}

export function createSecretVault(deps: SecretVaultDeps): SecretVault {
  return {
    backend: deps.backend,

    async getSecret(ref: string): Promise<string> {
      return storeForBackend(deps, parseSecretRef(ref).backend).getSecret(ref)
    },

    async setSecret(
      scope: string,
      key: string,
      value: string,
    ): Promise<string> {
      return storeForBackend(deps, deps.backend).setSecret(scope, key, value)
    },

    async deleteSecret(ref: string): Promise<void> {
      await storeForBackend(deps, parseSecretRef(ref).backend).deleteSecret(ref)
    },

    async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
      const entries = [
        ...(await deps.fileStore.listKeys()),
        ...(await deps.keychainStore.listKeys()),
      ]
      return entries.sort((left, right) =>
        left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0,
      )
    },
  }
}
