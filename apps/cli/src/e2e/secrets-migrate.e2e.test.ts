import { expect, test } from 'bun:test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { defaultConfig, readConfig, writeConfig } from '@ctxindex/core/config'
import {
  FileBackend,
  fileRef,
  KeychainBackend,
  keychainRef,
  probeKeychain,
  type SecretBackend,
} from '@ctxindex/core/secrets'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const secretScope = 'google'
const secretKey = 'refresh-token'
const secretValue = 'refresh-value'
const passphrase = 'portable-passphrase'

function configFile(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')
}

function fileStore(sandbox: Sandbox): FileBackend {
  return new FileBackend({
    dataDirectory: sandbox.env.CTXINDEX_DATA_HOME,
    configDirectory: sandbox.env.CTXINDEX_CONFIG_HOME,
    passphrase,
    createKeyFileIfMissing: false,
  })
}

async function writeBackendConfig(
  sandbox: Sandbox,
  backend: SecretBackend,
): Promise<void> {
  await writeConfig(
    { ...defaultConfig(), secrets: { backend } },
    configFile(sandbox),
  )
}

async function initWithBackend(
  sandbox: Sandbox,
  backend: SecretBackend,
): Promise<void> {
  const init = await sandbox.run(['init'])
  expect(init.exitCode).toBe(0)
  expect(init.stderr).toBe('')
  await writeBackendConfig(sandbox, backend)
}

type MockKeytarStore = Record<string, Record<string, string>>

async function readMockStore(path: string): Promise<MockKeytarStore> {
  if (!(await Bun.file(path).exists())) return {}
  return JSON.parse(await readFile(path, 'utf8')) as MockKeytarStore
}

async function writeMockStore(
  path: string,
  store: MockKeytarStore,
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
      const accounts = store[service]
      const existed = accounts?.[account] !== undefined
      if (accounts) delete accounts[account]
      await writeMockStore(path, store)
      return existed
    },
    async findCredentials(
      service: string,
    ): Promise<{ account: string; password: string }[]> {
      const store = await readMockStore(path)
      return Object.entries(store[service] ?? {}).map(
        ([account, password]) => ({ account, password }),
      )
    },
  }
}

function keytarImporter(mockFile: string) {
  return async () =>
    fileBackedKeytarMock(mockFile) as unknown as typeof import('keytar')
}

function keychainStore(mockFile: string): KeychainBackend {
  return new KeychainBackend({ importKeytar: keytarImporter(mockFile) })
}

function keychainEnv(mockFile: string): Record<string, string> {
  return {
    CTXINDEX_KEYTAR_MOCK_FILE: mockFile,
    CTXINDEX_SECRETS_PASSPHRASE: passphrase,
  }
}

test('secrets migrate file to keychain moves the secret and clears file backend', async () => {
  const sandbox = await createSandbox()
  const mockFile = join(sandbox.dir, 'keytar.json')

  try {
    await initWithBackend(sandbox, 'file')
    await fileStore(sandbox).setSecret(secretScope, secretKey, secretValue)

    const result = await sandbox.run(['secrets', 'migrate', 'keychain'], {
      env: keychainEnv(mockFile),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('migrated 1 secret to keychain')
    expect(
      await keychainStore(mockFile).getSecret(
        keychainRef(secretScope, secretKey),
      ),
    ).toBe(secretValue)
    expect(await fileStore(sandbox).listKeys()).toEqual([])
    expect(await readConfig(configFile(sandbox))).toMatchObject({
      secrets: { backend: 'keychain' },
    })
  } finally {
    await sandbox.cleanup()
  }
})

test('secrets migrate keychain to file moves the secret when mock keychain probes available', async () => {
  const sandbox = await createSandbox()
  const mockFile = join(sandbox.dir, 'keytar.json')
  const keychain = keychainStore(mockFile)

  try {
    await initWithBackend(sandbox, 'keychain')
    expect(
      await probeKeychain({ importKeytar: keytarImporter(mockFile) }),
    ).toBe(true)
    await keychain.setSecret(secretScope, secretKey, secretValue)

    const result = await sandbox.run(['secrets', 'migrate', 'file'], {
      env: keychainEnv(mockFile),
    })

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('migrated 1 secret to file')
    expect(await fileStore(sandbox).getSecret(fileRef(secretKey))).toBe(
      secretValue,
    )
    expect(await keychain.listKeys()).toEqual([])
    expect(await readConfig(configFile(sandbox))).toMatchObject({
      secrets: { backend: 'file' },
    })
  } finally {
    await sandbox.cleanup()
  }
})

test('secrets migrate file with no passphrase exits 2', async () => {
  const sandbox = await createSandbox()

  try {
    await initWithBackend(sandbox, 'keychain')

    const result = await sandbox.run(['secrets', 'migrate', 'file'])

    expect(result.exitCode).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('--passphrase')
    expect(result.stderr).toContain('CTXINDEX_SECRETS_PASSPHRASE')
  } finally {
    await sandbox.cleanup()
  }
})

test('secrets migrate duplicate migration idempotent', async () => {
  const sandbox = await createSandbox()
  const mockFile = join(sandbox.dir, 'keytar.json')
  const keychain = keychainStore(mockFile)

  try {
    await initWithBackend(sandbox, 'file')
    await fileStore(sandbox).setSecret(secretScope, secretKey, secretValue)

    const first = await sandbox.run(['secrets', 'migrate', 'keychain'], {
      env: keychainEnv(mockFile),
    })
    const second = await sandbox.run(['secrets', 'migrate', 'keychain'], {
      env: keychainEnv(mockFile),
    })

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    expect(second.stderr).toBe('')
    expect(second.stdout).toContain('secrets backend already keychain')
    expect(await keychain.getSecret(keychainRef(secretScope, secretKey))).toBe(
      secretValue,
    )
    expect(await keychain.listKeys()).toEqual([
      {
        ref: keychainRef(secretScope, secretKey),
        scope: secretScope,
        key: secretKey,
      },
    ])
    expect(await fileStore(sandbox).listKeys()).toEqual([])
  } finally {
    await sandbox.cleanup()
  }
})

test('secrets migrate backend unavailable non-zero keeps source secret', async () => {
  const sandbox = await createSandbox()
  const unavailableMockFile = join(sandbox.dir, 'missing-dir', 'keytar.json')

  try {
    await initWithBackend(sandbox, 'file')
    await fileStore(sandbox).setSecret(secretScope, secretKey, secretValue)

    const result = await sandbox.run(['secrets', 'migrate', 'keychain'], {
      env: keychainEnv(unavailableMockFile),
    })

    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('failed to write keychain secret')
    expect(await fileStore(sandbox).getSecret(fileRef(secretKey))).toBe(
      secretValue,
    )
    expect(await readConfig(configFile(sandbox))).toMatchObject({
      secrets: { backend: 'file' },
    })
  } finally {
    await sandbox.cleanup()
  }
})
