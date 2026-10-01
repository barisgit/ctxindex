import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdir, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { readConfig, writeConfig } from '@ctxindex/core/config'
import {
  FileBackend,
  KeychainBackend,
  type KeychainBackendOptions,
} from '@ctxindex/core/secrets'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

const accessValue = 'ACCESS-VALUE-CANARY'
const refreshValue = 'REFRESH-VALUE-CANARY'
const appConfigValue = '{"clientId":"APP-CONFIG-CANARY"}'

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function configPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml')
}

function fileStore(sandbox: Sandbox): FileBackend {
  return new FileBackend({
    dataDirectory: sandbox.env.CTXINDEX_DATA_HOME,
    configDirectory: sandbox.env.CTXINDEX_CONFIG_HOME,
    createKeyFileIfMissing: false,
  })
}

type MockStore = Record<string, Record<string, string>>

async function readMockStore(path: string): Promise<MockStore> {
  if (!(await Bun.file(path).exists())) return {}
  return JSON.parse(await readFile(path, 'utf8')) as MockStore
}

function fileBackedKeytar(path: string) {
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
      await Bun.write(path, JSON.stringify(store))
    },
    async deletePassword(service: string, account: string): Promise<boolean> {
      const store = await readMockStore(path)
      const existed = store[service]?.[account] !== undefined
      if (store[service]) delete store[service][account]
      await Bun.write(path, JSON.stringify(store))
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

function keychainStore(path: string): KeychainBackend {
  const importKeytar = async () =>
    fileBackedKeytar(path) as unknown as Awaited<
      ReturnType<NonNullable<KeychainBackendOptions['importKeytar']>>
    >
  return new KeychainBackend({ importKeytar })
}

function seedGrant(
  sandbox: Sandbox,
  appConfigRef: string,
  accessRef: string,
  refreshRef: string,
): void {
  const db = new Database(dbPath(sandbox))
  const now = Date.now()
  try {
    db.prepare(
      `INSERT INTO accounts
         (id, provider, label, external_user_id, created_at, updated_at)
       VALUES ('account-1', 'google', 'person@example.test', 'subject-1', ?, ?)`,
    ).run(now, now)
    db.prepare(
      `INSERT INTO grants
         (id, account_id, provider, scopes_json, app_config_ref,
          access_token_ref, refresh_token_ref, created_at, updated_at)
       VALUES ('grant-1', 'account-1', 'google', '[]', ?, ?, ?, ?, ?)`,
    ).run(appConfigRef, accessRef, refreshRef, now, now)
  } finally {
    db.close()
  }
}

function grantRefs(sandbox: Sandbox): {
  appConfigRef: string
  accessTokenRef: string
  refreshTokenRef: string
} {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare(
        `SELECT app_config_ref AS appConfigRef,
                access_token_ref AS accessTokenRef,
                refresh_token_ref AS refreshTokenRef
         FROM grants WHERE id = 'grant-1'`,
      )
      .get() as {
      appConfigRef: string
      accessTokenRef: string
      refreshTokenRef: string
    }
    return row
  } finally {
    db.close()
  }
}

function expectNoValues(output: string): void {
  expect(output).not.toContain(accessValue)
  expect(output).not.toContain(refreshValue)
  expect(output).not.toContain(appConfigValue)
}

test('secret backend status and switching preserve typed refs without exposing values', async () => {
  const sandbox = await createSandbox()
  const unavailableMock = join(sandbox.dir, 'missing-keychain', 'keytar.json')
  const mockFile = sandbox.env.CTXINDEX_KEYTAR_MOCK_FILE
  if (!mockFile) throw new Error('sandbox Keychain mock path is required')

  try {
    const init = await sandbox.run(['init'], {
      env: { CTXINDEX_KEYTAR_MOCK_FILE: unavailableMock },
    })
    expect(init.exitCode).toBe(0)
    expect((await readConfig(configPath(sandbox))).secrets.backend).toBe('file')
    expect(
      (await stat(join(sandbox.env.CTXINDEX_CONFIG_HOME, 'secret.key'))).mode &
        0o777,
    ).toBe(0o600)

    const files = fileStore(sandbox)
    const accessRef = await files.setSecret(
      'google',
      'access-token',
      accessValue,
    )
    const refreshRef = await files.setSecret(
      'google',
      'refresh-token',
      refreshValue,
    )
    const appConfigRef = await files.setSecret(
      'google',
      'app-config',
      appConfigValue,
    )
    seedGrant(sandbox, appConfigRef, accessRef, refreshRef)

    const status = await sandbox.run(['secrets', 'status', '--format', 'json'])
    expect(status.exitCode).toBe(0)
    expect(status.stderr).toBe('')
    expect(JSON.parse(status.stdout)).toEqual({
      backend: 'file',
      backends: {
        file: { available: true, referenceCount: 3 },
        keychain: { available: true, referenceCount: 0 },
      },
    })
    expectNoValues(status.stdout + status.stderr)

    const toKeychain = await sandbox.run([
      'secrets',
      'backend',
      'set',
      'keychain',
    ])
    expect(toKeychain.exitCode).toBe(0)
    expect(toKeychain.stderr).toBe('')
    expect(toKeychain.stdout.trim()).toBe(
      'secrets backend set to keychain; copied 3; cleaned 3',
    )
    expectNoValues(toKeychain.stdout + toKeychain.stderr)
    expect((await readConfig(configPath(sandbox))).secrets.backend).toBe(
      'keychain',
    )
    expect(grantRefs(sandbox)).toEqual({
      appConfigRef: 'keychain:ctxindex/google/app-config',
      accessTokenRef: 'keychain:ctxindex/google/access-token',
      refreshTokenRef: 'keychain:ctxindex/google/refresh-token',
    })
    expect(await files.listKeys()).toEqual([])
    const keychain = keychainStore(mockFile)
    expect(
      await keychain.getSecret('keychain:ctxindex/google/access-token'),
    ).toBe(accessValue)
    expect(
      await keychain.getSecret('keychain:ctxindex/google/refresh-token'),
    ).toBe(refreshValue)
    expect(
      await keychain.getSecret('keychain:ctxindex/google/app-config'),
    ).toBe(appConfigValue)

    const toFile = await sandbox.run(['secrets', 'backend', 'set', 'file'])
    expect(toFile.exitCode).toBe(0)
    expect(toFile.stderr).toBe('')
    expect(toFile.stdout.trim()).toBe(
      'secrets backend set to file; copied 3; cleaned 3',
    )
    expectNoValues(toFile.stdout + toFile.stderr)
    expect((await readConfig(configPath(sandbox))).secrets.backend).toBe('file')
    expect(grantRefs(sandbox)).toEqual({
      appConfigRef: 'file:secrets.box#google/app-config',
      accessTokenRef: 'file:secrets.box#google/access-token',
      refreshTokenRef: 'file:secrets.box#google/refresh-token',
    })
    expect(await files.getSecret(grantRefs(sandbox).accessTokenRef)).toBe(
      accessValue,
    )
    expect(await files.getSecret(grantRefs(sandbox).refreshTokenRef)).toBe(
      refreshValue,
    )
    expect(await files.getSecret(grantRefs(sandbox).appConfigRef)).toBe(
      appConfigValue,
    )
    expect(await keychain.listKeys()).toEqual([])

    // The daemon retains the mock path it received on first startup. Turn that
    // same file-backed mock unavailable instead of trying to replace its
    // environment in later client commands.
    await rm(mockFile, { force: true })
    await mkdir(mockFile)

    const failedSwitch = await sandbox.run([
      'secrets',
      'backend',
      'set',
      'keychain',
    ])
    expect(failedSwitch.exitCode).toBe(50)
    expectNoValues(failedSwitch.stdout + failedSwitch.stderr)
    expect((await readConfig(configPath(sandbox))).secrets.backend).toBe('file')
    expect(grantRefs(sandbox).refreshTokenRef).toStartWith('file:')
    expect(await files.getSecret(grantRefs(sandbox).refreshTokenRef)).toBe(
      refreshValue,
    )

    const unavailableStatus = await sandbox.run([
      'secrets',
      'status',
      '--format',
      'json',
    ])
    expect(unavailableStatus.exitCode).toBe(0)
    expect(JSON.parse(unavailableStatus.stdout)).toMatchObject({
      backend: 'file',
      backends: { keychain: { available: false, referenceCount: 0 } },
    })
    expectNoValues(unavailableStatus.stdout + unavailableStatus.stderr)

    const config = await readConfig(configPath(sandbox))
    await writeConfig(
      {
        ...config,
        extensions: { paths: [join(sandbox.dir, 'missing-extension.ts')] },
      },
      configPath(sandbox),
    )
    const lightStatus = await sandbox.run([
      'secrets',
      'status',
      '--format',
      'json',
    ])
    expect(lightStatus.exitCode).toBe(0)
    expect(lightStatus.stderr).toBe('')
    expect(JSON.parse(lightStatus.stdout).backend).toBe('file')
  } finally {
    await sandbox.cleanup()
  }
})

test('legacy and literal-secret options fail before initialization without echoing values', async () => {
  const sandbox = await createSandbox()
  const canary = 'ARGV-SECRET-CANARY'

  try {
    for (const args of [
      ['secrets', 'migrate', 'file'],
      ['secrets', 'backend', 'set', 'file', '--passphrase', canary],
      ['secrets', 'backend', 'set', 'file', `--passphrase=${canary}`],
    ]) {
      const result = await sandbox.run(args)
      expect(result.exitCode).toBe(2)
      expect(result.stdout + result.stderr).not.toContain(canary)
    }
    expect(await Bun.file(dbPath(sandbox)).exists()).toBe(false)
    expect(await Bun.file(configPath(sandbox)).exists()).toBe(false)
  } finally {
    await sandbox.cleanup()
  }
})
