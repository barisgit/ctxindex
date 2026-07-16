import { expect, test } from 'bun:test'
import {
  CtxindexSecretsError,
  fileRef,
  keychainRef,
  type SecretBackend,
  type SecretsStore,
} from './types'
import { createSecretVault } from './vault'

class MemorySecretsStore implements SecretsStore {
  readonly entries = new Map<
    string,
    { readonly scope: string; readonly key: string; readonly value: string }
  >()

  constructor(
    private readonly backend: SecretBackend,
    private readonly unavailable = false,
  ) {}

  async getSecret(ref: string): Promise<string> {
    this.assertAvailable()
    const entry = this.entries.get(ref)
    if (!entry)
      throw new CtxindexSecretsError(`missing secret: ${ref}`, 'not_found')
    return entry.value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    this.assertAvailable()
    const ref =
      this.backend === 'file' ? fileRef(scope, key) : keychainRef(scope, key)
    this.entries.set(ref, { scope, key, value })
    return ref
  }

  async deleteSecret(ref: string): Promise<void> {
    this.assertAvailable()
    this.entries.delete(ref)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    this.assertAvailable()
    return [...this.entries].map(([ref, entry]) => ({
      ref,
      scope: entry.scope,
      key: entry.key,
    }))
  }

  private assertAvailable(): void {
    if (this.unavailable)
      throw new CtxindexSecretsError(
        `${this.backend} unavailable`,
        'backend_unavailable',
      )
  }
}

test('vault routes typed reads and deletes while writing only to the configured backend', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain')
  const fileExisting = await fileStore.setSecret('google', 'file-key', 'FILE')
  const keychainExisting = await keychainStore.setSecret(
    'google',
    'keychain-key',
    'KEYCHAIN',
  )
  const vault = createSecretVault({
    fileStore,
    keychainStore,
    backend: 'file',
  })

  expect(await vault.getSecret(fileExisting)).toBe('FILE')
  expect(await vault.getSecret(keychainExisting)).toBe('KEYCHAIN')

  const written = await vault.setSecret('google', 'new-key', 'NEW')
  expect(written).toBe('file:secrets.box#google/new-key')
  expect(await fileStore.getSecret(written)).toBe('NEW')
  expect(keychainStore.entries.has(keychainRef('google', 'new-key'))).toBe(
    false,
  )

  await vault.deleteSecret(keychainExisting)
  expect(keychainStore.entries.has(keychainExisting)).toBe(false)
})

test('vault fails when the configured write backend is unavailable and never falls back', async () => {
  const fileStore = new MemorySecretsStore('file')
  const keychainStore = new MemorySecretsStore('keychain', true)
  const vault = createSecretVault({
    fileStore,
    keychainStore,
    backend: 'keychain',
  })

  await expect(
    vault.setSecret('google', 'refresh-token', 'NEVER-FALL-BACK'),
  ).rejects.toMatchObject({ code: 'backend_unavailable' })
  expect(fileStore.entries.size).toBe(0)
})
