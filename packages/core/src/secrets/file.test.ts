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

    expect(ref).toBe('file:secrets.box#refresh-token')
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
    await expect(store.getSecret(ref)).rejects.toMatchObject({
      code: 'not_found',
    })
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
