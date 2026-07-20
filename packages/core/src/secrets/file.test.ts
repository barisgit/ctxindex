import { afterEach, expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resetEnvForTests } from '../config/env-loader'
import { FileBackend, secretsBoxPath } from './file'
import { CtxindexSecretsError } from './types'

const pathEnv = [
  'CTXINDEX_CONFIG_HOME',
  'CTXINDEX_DATA_HOME',
  'CTXINDEX_SECRETS_PASSPHRASE',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
] as const

const savedEnv = new Map<string, string | undefined>()
for (const key of pathEnv) savedEnv.set(key, process.env[key])

function setEnv(
  key: (typeof pathEnv)[number],
  value: string | undefined,
): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const key of pathEnv) {
    const value = savedEnv.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  resetEnvForTests()
})

test('file references preserve scope so equal keys cannot collide', async () => {
  const { root } = await sandbox()
  try {
    const store = new FileBackend()
    const google = await store.setSecret('google', 'refresh-token', 'GOOGLE')
    const microsoft = await store.setSecret(
      'microsoft',
      'refresh-token',
      'MICROSOFT',
    )

    expect(google).toBe('file:secrets.box#google/refresh-token')
    expect(microsoft).toBe('file:secrets.box#microsoft/refresh-token')
    expect(await store.getSecret(google)).toBe('GOOGLE')
    expect(await store.getSecret(microsoft)).toBe('MICROSOFT')
    expect(await store.listKeys()).toEqual([
      { ref: google, scope: 'google', key: 'refresh-token' },
      { ref: microsoft, scope: 'microsoft', key: 'refresh-token' },
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('explicit file-backend probe prepares private key material without writing a box', async () => {
  const { root, configHome, dataHome } = await sandbox()
  try {
    const store = new FileBackend()
    await store.probeAvailable()

    const keyPath = join(configHome, 'secret.key')
    expect((await readFile(keyPath)).byteLength).toBe(32)
    if (process.platform !== 'darwin') expect(await mode(keyPath)).toBe(0o600)
    expect(await Bun.file(secretsBoxPath(dataHome)).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('file key index uses deterministic code-unit ordering', async () => {
  const { root } = await sandbox()
  try {
    const store = new FileBackend()
    await store.setSecret('a', 'key', 'a')
    await store.setSecret('_', 'key', '_')
    await store.setSecret('A', 'key', 'A')

    expect((await store.listKeys()).map((entry) => entry.ref)).toEqual([
      'file:secrets.box#A/key',
      'file:secrets.box#_/key',
      'file:secrets.box#a/key',
    ])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function sandbox(): Promise<{
  root: string
  configHome: string
  dataHome: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-secrets-file-'))
  const configHome = join(root, 'config', 'ctxindex')
  const dataHome = join(root, 'data', 'ctxindex')
  setEnv('XDG_CONFIG_HOME', join(root, 'config'))
  setEnv('XDG_DATA_HOME', join(root, 'data'))
  setEnv('CTXINDEX_CONFIG_HOME', undefined)
  setEnv('CTXINDEX_DATA_HOME', undefined)
  setEnv('CTXINDEX_SECRETS_PASSPHRASE', undefined)
  resetEnvForTests()
  return { root, configHome, dataHome }
}

async function mode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}

test('file backend round-trips, lists, deletes, encrypts, and forces private mode', async () => {
  const { root, dataHome } = await sandbox()
  try {
    const store = new FileBackend({ passphrase: 'test-passphrase' })
    const ref = await store.setSecret('google', 'refresh-token', 'plain-secret')

    expect(ref).toBe('file:secrets.box#google/refresh-token')
    expect(await store.getSecret(ref)).toBe('plain-secret')
    expect(await store.listKeys()).toEqual([
      { ref, scope: 'google', key: 'refresh-token' },
    ])

    const boxPath = secretsBoxPath(dataHome)
    const ciphertext = await readFile(boxPath, 'utf8')
    expect(ciphertext).not.toContain('plain-secret')
    if (process.platform !== 'darwin') {
      expect(await mode(boxPath)).toBe(0o600)
      expect(await mode(dataHome)).toBe(0o700)
    }

    await chmod(boxPath, 0o644)
    await store.setSecret('google', 'client-secret', 'second-secret')
    if (process.platform !== 'darwin') {
      expect(await mode(boxPath)).toBe(0o600)
    }

    await store.deleteSecret(ref)
    await expect(store.deleteSecret(ref)).resolves.toBeUndefined()
    await expect(store.getSecret(ref)).rejects.toMatchObject({
      code: 'not_found',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('passphrase envelope requires passphrase material and never falls back to a key file', async () => {
  const { root, dataHome } = await sandbox()
  try {
    const initial = new FileBackend({ passphrase: 'required-passphrase' })
    const ref = await initial.setSecret('scope', 'key', 'PASSPHRASE-VALUE')
    const envelope = JSON.parse(
      await readFile(secretsBoxPath(dataHome), 'utf8'),
    ) as { v: number; keyMode?: string }
    expect(envelope).toMatchObject({ v: 2, keyMode: 'passphrase' })

    await expect(
      new FileBackend({ createKeyFileIfMissing: true }).getSecret(ref),
    ).rejects.toMatchObject({ code: 'backend_unavailable' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('encrypted envelope records key-file mode and ignores a later passphrase environment', async () => {
  const { root, dataHome } = await sandbox()
  try {
    const initial = new FileBackend()
    const ref = await initial.setSecret('scope', 'key', 'KEY-FILE-VALUE')
    const envelope = JSON.parse(
      await readFile(secretsBoxPath(dataHome), 'utf8'),
    ) as { v: number; keyMode?: string }
    expect(envelope).toMatchObject({ v: 2, keyMode: 'key-file' })

    setEnv('CTXINDEX_SECRETS_PASSPHRASE', 'later-passphrase')
    resetEnvForTests()
    const reopened = new FileBackend()
    expect(await reopened.getSecret(ref)).toBe('KEY-FILE-VALUE')
    await reopened.setSecret('scope', 'second', 'SECOND')
    const rewritten = JSON.parse(
      await readFile(secretsBoxPath(dataHome), 'utf8'),
    ) as { keyMode?: string; keyCheck?: string; boxMac?: string }
    expect(rewritten.keyMode).toBe('key-file')
    expect(rewritten.keyCheck).toBeString()
    expect(rewritten.boxMac).toBeString()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('file backend supports passphrase without creating a key file', async () => {
  const { root, configHome } = await sandbox()
  try {
    const store = new FileBackend({ passphrase: 'portable' })
    const ref = await store.setSecret('scope', 'key', 'value')
    expect(await store.getSecret(ref)).toBe('value')
    expect(await Bun.file(join(configHome, 'secret.key')).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('file backend falls back to a generated device key file', async () => {
  const { root, configHome } = await sandbox()
  try {
    const store = new FileBackend()
    const ref = await store.setSecret('scope', 'key', 'value')
    expect(await store.getSecret(ref)).toBe('value')

    const keyPath = join(configHome, 'secret.key')
    expect((await readFile(keyPath)).byteLength).toBe(32)
    if (process.platform !== 'darwin') expect(await mode(keyPath)).toBe(0o600)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('file backend detects tampered ciphertext', async () => {
  const { root, dataHome } = await sandbox()
  try {
    const store = new FileBackend({ passphrase: 'tamper-passphrase' })
    const ref = await store.setSecret('scope', 'key', 'value')
    const boxPath = secretsBoxPath(dataHome)
    const envelope = JSON.parse(await readFile(boxPath, 'utf8')) as {
      entries: { box: string }
    }
    const bytes = Buffer.from(envelope.entries.box, 'base64')
    bytes[0] = (bytes[0] ?? 0) ^ 0xff
    envelope.entries.box = bytes.toString('base64')
    await Bun.write(boxPath, `${JSON.stringify(envelope)}\n`)

    await expect(store.probeAvailable()).rejects.toMatchObject({
      code: 'decrypt_failed',
    })
    await expect(store.getSecret(ref)).rejects.toBeInstanceOf(
      CtxindexSecretsError,
    )
    await expect(store.getSecret(ref)).rejects.toMatchObject({
      code: 'decrypt_failed',
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
