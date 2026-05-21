import { readFile, writeFile } from 'node:fs/promises'
import {
  CtxindexSecretsError,
  keychainRef,
  parseSecretRef,
  type SecretsStore,
  wrapSecretsError,
} from './types'

type KeytarModule = typeof import('keytar')

type KeytarImporter = () => Promise<KeytarModule>

const indexService = 'ctxindex'
const indexAccount = '__ctxindex_keys__'

interface KeychainIndexEntry {
  readonly ref: string
  readonly scope: string
  readonly key: string
}

export interface KeychainBackendOptions {
  readonly importKeytar?: KeytarImporter
}

function serviceName(scope: string): string {
  return `ctxindex/${scope}`
}

async function defaultImportKeytar(): Promise<KeytarModule> {
  const mockFile = process.env.CTXINDEX_KEYTAR_MOCK_FILE
  if (mockFile) return fileBackedKeytarMock(mockFile) as KeytarModule
  return import('keytar')
}

async function readMockStore(
  path: string,
): Promise<Record<string, Record<string, string>>> {
  if (!(await Bun.file(path).exists())) return {}
  return JSON.parse(await readFile(path, 'utf8')) as Record<
    string,
    Record<string, string>
  >
}

async function writeMockStore(
  path: string,
  store: Record<string, Record<string, string>>,
): Promise<void> {
  await writeFile(path, JSON.stringify(store), { mode: 0o600 })
}

function fileBackedKeytarMock(path: string) {
  return {
    async getPassword(
      service: string,
      account: string,
    ): Promise<string | null> {
      const store = await readMockStore(path)
      return store[service]?.[account] ?? null
    },
    async setPassword(
      service: string,
      account: string,
      password: string,
    ): Promise<void> {
      const store = await readMockStore(path)
      store[service] = { ...(store[service] ?? {}), [account]: password }
      await writeMockStore(path, store)
    },
    async deletePassword(service: string, account: string): Promise<boolean> {
      const store = await readMockStore(path)
      const existed = store[service]?.[account] !== undefined
      if (store[service]) delete store[service][account]
      await writeMockStore(path, store)
      return existed
    },
    async findCredentials(
      service: string,
    ): Promise<{ account: string; password: string }[]> {
      const store = await readMockStore(path)
      return Object.entries(store[service] ?? {}).map(
        ([account, password]) => ({
          account,
          password,
        }),
      )
    },
  }
}

export class KeychainBackend implements SecretsStore {
  private readonly importKeytar: KeytarImporter

  constructor(options: KeychainBackendOptions = {}) {
    this.importKeytar = options.importKeytar ?? defaultImportKeytar
  }

  async assertAvailable(): Promise<void> {
    await this.keytar()
  }

  async probeAvailable(): Promise<void> {
    const account = `probe-${process.pid}-${Date.now()}`
    const keytar = await this.keytar()
    try {
      await keytar.setPassword('ctxindex/probe', account, 'ok')
      const value = await keytar.getPassword('ctxindex/probe', account)
      if (value !== 'ok') throw new Error('keychain probe read mismatch')
      await keytar.deletePassword('ctxindex/probe', account)
    } catch (cause) {
      throw new CtxindexSecretsError(
        'keychain backend unavailable',
        'backend_unavailable',
        { cause },
      )
    }
  }

  async getSecret(ref: string): Promise<string> {
    const parsed = parseSecretRef(ref)
    if (parsed.backend !== 'keychain') {
      throw new CtxindexSecretsError(
        `keychain backend cannot resolve ${ref}`,
        'invalid_ref',
      )
    }

    const keytar = await this.keytar()
    try {
      const value = await keytar.getPassword(
        serviceName(parsed.scope),
        parsed.key,
      )
      if (value === null) {
        throw new CtxindexSecretsError(`secret not found: ${ref}`, 'not_found')
      }
      return value
    } catch (err) {
      throw wrapKeytarRuntimeError(err, 'failed to read keychain secret')
    }
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const ref = keychainRef(scope, key)
    const keytar = await this.keytar()
    try {
      await keytar.setPassword(serviceName(scope), key, value)
      await this.addIndexEntry({ ref, scope, key }, keytar)
      return ref
    } catch (err) {
      throw wrapKeytarRuntimeError(err, 'failed to write keychain secret')
    }
  }

  async deleteSecret(ref: string): Promise<void> {
    const parsed = parseSecretRef(ref)
    if (parsed.backend !== 'keychain') {
      throw new CtxindexSecretsError(
        `keychain backend cannot delete ${ref}`,
        'invalid_ref',
      )
    }

    const keytar = await this.keytar()
    try {
      await keytar.deletePassword(serviceName(parsed.scope), parsed.key)
      await this.removeIndexEntry(ref, keytar)
    } catch (err) {
      throw wrapKeytarRuntimeError(err, 'failed to delete keychain secret')
    }
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    const keytar = await this.keytar()
    try {
      return (await this.readIndex(keytar)).sort((a, b) =>
        a.ref.localeCompare(b.ref),
      )
    } catch (err) {
      throw wrapKeytarRuntimeError(err, 'failed to list keychain secrets')
    }
  }

  private async keytar(): Promise<KeytarModule> {
    try {
      return await this.importKeytar()
    } catch (cause) {
      throw new CtxindexSecretsError(
        'keychain backend unavailable; run ctxindex secrets migrate file',
        'backend_unavailable',
        { cause },
      )
    }
  }

  private async readIndex(keytar: KeytarModule): Promise<KeychainIndexEntry[]> {
    const raw = await keytar.getPassword(indexService, indexAccount)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as KeychainIndexEntry[]
    return parsed.filter((entry) => entry.ref && entry.scope && entry.key)
  }

  private async writeIndex(
    entries: KeychainIndexEntry[],
    keytar: KeytarModule,
  ): Promise<void> {
    await keytar.setPassword(
      indexService,
      indexAccount,
      JSON.stringify(entries),
    )
  }

  private async addIndexEntry(
    entry: KeychainIndexEntry,
    keytar: KeytarModule,
  ): Promise<void> {
    const entries = (await this.readIndex(keytar)).filter(
      (existing) => existing.ref !== entry.ref,
    )
    entries.push(entry)
    await this.writeIndex(entries, keytar)
  }

  private async removeIndexEntry(
    ref: string,
    keytar: KeytarModule,
  ): Promise<void> {
    const entries = (await this.readIndex(keytar)).filter(
      (entry) => entry.ref !== ref,
    )
    await this.writeIndex(entries, keytar)
  }
}

function wrapKeytarRuntimeError(
  err: unknown,
  message: string,
): CtxindexSecretsError {
  if (err instanceof CtxindexSecretsError) return err
  return wrapSecretsError(err, message, 'backend_unavailable')
}

export async function probeKeychain(
  options: KeychainBackendOptions = {},
): Promise<boolean> {
  try {
    await new KeychainBackend(options).probeAvailable()
    return true
  } catch {
    return false
  }
}
