import { readFile, writeFile } from 'node:fs/promises'
import { getEnv } from '../config/env-loader'
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
const probeService = 'ctxindex.internal.probe'
const probeAccount = '__ctxindex_probe__'
let indexOperationTail: Promise<void> = Promise.resolve()

interface KeychainIndexEntry {
  readonly ref: string
  readonly scope: string
  readonly key: string
}

async function withIndexOperation<T>(
  operation: () => Promise<T>,
  onQueuedForTesting?: () => void,
): Promise<T> {
  const prior = indexOperationTail
  let release = () => {}
  indexOperationTail = new Promise<void>((resolve) => {
    release = resolve
  })
  onQueuedForTesting?.()
  await prior
  try {
    return await operation()
  } finally {
    release()
  }
}

export interface KeychainBackendOptions {
  readonly importKeytar?: KeytarImporter
  /** @internal */
  readonly onIndexOperationQueuedForTesting?: () => void
}

function serviceName(scope: string): string {
  return `ctxindex/${scope}`
}

async function defaultImportKeytar(): Promise<KeytarModule> {
  const mockFile = getEnv().CTXINDEX_KEYTAR_MOCK_FILE
  if (mockFile) return fileBackedKeytarMock(mockFile) as KeytarModule
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.CTXINDEX_LIVE_TESTS !== '1'
  ) {
    throw new CtxindexSecretsError(
      'test processes must configure CTXINDEX_KEYTAR_MOCK_FILE',
      'backend_unavailable',
    )
  }
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
  private readonly onIndexOperationQueuedForTesting: (() => void) | undefined

  constructor(options: KeychainBackendOptions = {}) {
    this.importKeytar = options.importKeytar ?? defaultImportKeytar
    this.onIndexOperationQueuedForTesting =
      options.onIndexOperationQueuedForTesting
  }

  async assertAvailable(): Promise<void> {
    await this.keytar()
  }

  async probeAvailable(): Promise<void> {
    const keytar = await this.keytar()
    let failure: unknown
    await withIndexOperation(async () => {
      let persisted = false
      try {
        await keytar.setPassword(probeService, probeAccount, 'ok')
        persisted = true
        const value = await keytar.getPassword(probeService, probeAccount)
        if (value !== 'ok') throw new Error('keychain probe read mismatch')
      } catch (cause) {
        failure = cause
      }
      if (persisted) {
        try {
          const deleted = await keytar.deletePassword(
            probeService,
            probeAccount,
          )
          if (!deleted) throw new Error('keychain probe cleanup mismatch')
        } catch (cause) {
          failure ??= cause
        }
      }
    }, this.onIndexOperationQueuedForTesting)
    if (failure !== undefined) {
      throw new CtxindexSecretsError(
        'keychain backend unavailable',
        'backend_unavailable',
        { cause: failure },
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
      return await withIndexOperation(async () => {
        const previousEntries = await this.readIndex(keytar)
        const entries = previousEntries.filter(
          (existing) => existing.ref !== ref,
        )
        entries.push({ ref, scope, key })
        await this.writeIndex(entries, keytar)
        try {
          await keytar.setPassword(serviceName(scope), key, value)
        } catch (cause) {
          try {
            await this.writeIndex(previousEntries, keytar)
          } catch {}
          throw cause
        }
        return ref
      }, this.onIndexOperationQueuedForTesting)
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
      await withIndexOperation(async () => {
        await keytar.deletePassword(serviceName(parsed.scope), parsed.key)
        await this.removeIndexEntry(ref, keytar)
      }, this.onIndexOperationQueuedForTesting)
    } catch (err) {
      throw wrapKeytarRuntimeError(err, 'failed to delete keychain secret')
    }
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    const keytar = await this.keytar()
    try {
      return await withIndexOperation(
        async () =>
          (await this.readIndex(keytar)).sort((a, b) =>
            a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0,
          ),
        this.onIndexOperationQueuedForTesting,
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
        'keychain backend unavailable; run ctxindex secrets backend set file',
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
