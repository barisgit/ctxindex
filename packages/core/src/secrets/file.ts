import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { configDir, dataDir } from '../paths'
import {
  CtxindexSecretsError,
  fileRef,
  parseSecretRef,
  type SecretsStore,
  wrapSecretsError,
} from './types'

const boxFileName = 'secrets.box'
const keyFileName = 'secret.key'
const kdfIters = 200_000

type FileKdf = 'pbkdf2-sha256'

interface SecretRecord {
  readonly scope: string
  readonly key: string
  readonly value: string
}

interface SecretsPlaintext {
  readonly records: Record<string, SecretRecord>
}

interface SecretsEnvelope {
  readonly v: 1
  readonly nonce: string
  readonly salt: string
  readonly kdf: FileKdf
  readonly iters?: number
  readonly entries: Record<string, string>
}

export interface FileBackendOptions {
  readonly passphrase?: string
  readonly dataDirectory?: string
  readonly configDirectory?: string
  readonly createKeyFileIfMissing?: boolean
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'))
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function secretKeyPath(configDirectory = configDir()): string {
  return join(configDirectory, keyFileName)
}

export function secretsBoxPath(dataDirectory = dataDir()): string {
  return join(dataDirectory, boxFileName)
}

async function exists(path: string): Promise<boolean> {
  return Bun.file(path).exists()
}

async function ensurePrivateDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  await chmod(path, 0o700).catch(() => undefined)
}

async function atomicWritePrivate(
  path: string,
  contents: string,
): Promise<void> {
  await ensurePrivateDir(dirname(path))
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmpPath, contents, { mode: 0o600 })
  await chmod(tmpPath, 0o600).catch(() => undefined)
  await rename(tmpPath, path)
  await chmod(path, 0o600).catch(() => undefined)
}

export async function ensureSecretKeyFile(
  configDirectory = configDir(),
): Promise<string> {
  const path = secretKeyPath(configDirectory)
  if (await exists(path)) {
    await chmod(path, 0o600).catch(() => undefined)
    return path
  }

  await ensurePrivateDir(dirname(path))
  await writeFile(path, randomBytes(32), { mode: 0o600 })
  await chmod(path, 0o600).catch(() => undefined)
  return path
}

export async function hasFileSecretMaterial(
  options: Pick<FileBackendOptions, 'passphrase' | 'configDirectory'> = {},
): Promise<boolean> {
  if (options.passphrase || process.env.CTXINDEX_SECRETS_PASSPHRASE) return true
  return exists(secretKeyPath(options.configDirectory))
}

export class FileBackend implements SecretsStore {
  private readonly path: string
  private readonly configDirectory: string
  private readonly passphrase: string | undefined
  private readonly createKeyFileIfMissing: boolean

  constructor(options: FileBackendOptions = {}) {
    this.path = secretsBoxPath(options.dataDirectory)
    this.configDirectory = options.configDirectory ?? configDir()
    this.passphrase = options.passphrase
    this.createKeyFileIfMissing = options.createKeyFileIfMissing ?? true
  }

  async getSecret(ref: string): Promise<string> {
    const parsed = parseSecretRef(ref)
    if (parsed.backend !== 'file') {
      throw new CtxindexSecretsError(
        `file backend cannot resolve ${ref}`,
        'invalid_ref',
      )
    }

    const records = await this.readRecords()
    const record = records[parsed.key]
    if (!record) {
      throw new CtxindexSecretsError(`secret not found: ${ref}`, 'not_found')
    }
    return record.value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const records = await this.readRecords()
    records[key] = { scope, key, value }
    await this.writeRecords(records)
    return fileRef(key)
  }

  async deleteSecret(ref: string): Promise<void> {
    const parsed = parseSecretRef(ref)
    if (parsed.backend !== 'file') {
      throw new CtxindexSecretsError(
        `file backend cannot delete ${ref}`,
        'invalid_ref',
      )
    }

    const records = await this.readRecords()
    delete records[parsed.key]
    await this.writeRecords(records)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    const records = await this.readRecords()
    return Object.values(records)
      .map((record) => ({
        ref: fileRef(record.key),
        scope: record.scope,
        key: record.key,
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref))
  }

  private async readRecords(): Promise<Record<string, SecretRecord>> {
    if (!(await exists(this.path))) return {}

    let envelope: SecretsEnvelope
    try {
      envelope = JSON.parse(
        await readFile(this.path, 'utf8'),
      ) as SecretsEnvelope
    } catch (cause) {
      throw new CtxindexSecretsError(
        'failed to read encrypted secrets file',
        'decrypt_failed',
        { cause },
      )
    }

    try {
      if (envelope.v !== 1 || envelope.kdf !== 'pbkdf2-sha256') {
        throw new Error('unsupported secrets.box version or kdf')
      }
      const ciphertext = envelope.entries.box
      if (!ciphertext) throw new Error('missing encrypted entries box')

      const key = await this.deriveKey(fromBase64(envelope.salt))
      const cipher = xchacha20poly1305(key, fromBase64(envelope.nonce))
      const plaintext = cipher.decrypt(fromBase64(ciphertext))
      const decoded = JSON.parse(decodeText(plaintext)) as SecretsPlaintext
      return decoded.records ?? {}
    } catch (cause) {
      throw new CtxindexSecretsError(
        'failed to decrypt secrets.box',
        'decrypt_failed',
        { cause },
      )
    }
  }

  private async writeRecords(
    records: Record<string, SecretRecord>,
  ): Promise<void> {
    const salt = randomBytes(16)
    const nonce = randomBytes(24)
    const key = await this.deriveKey(salt)
    const cipher = xchacha20poly1305(key, nonce)
    const plaintext = textBytes(
      JSON.stringify({ records } satisfies SecretsPlaintext),
    )
    const encrypted = cipher.encrypt(plaintext)
    const envelope: SecretsEnvelope = {
      v: 1,
      nonce: toBase64(nonce),
      salt: toBase64(salt),
      kdf: 'pbkdf2-sha256',
      ...(this.passphrase || process.env.CTXINDEX_SECRETS_PASSPHRASE
        ? { iters: kdfIters }
        : {}),
      entries: { box: toBase64(encrypted) },
    }

    try {
      await atomicWritePrivate(this.path, `${JSON.stringify(envelope)}\n`)
    } catch (cause) {
      throw new CtxindexSecretsError(
        'failed to write encrypted secrets file',
        'io',
        { cause },
      )
    }
  }

  private async deriveKey(salt: Uint8Array): Promise<Uint8Array> {
    const passphrase =
      this.passphrase ?? process.env.CTXINDEX_SECRETS_PASSPHRASE
    if (passphrase) {
      return pbkdf2(sha256, textBytes(passphrase), salt, {
        c: kdfIters,
        dkLen: 32,
      })
    }

    const keyPath = secretKeyPath(this.configDirectory)
    if (!(await exists(keyPath))) {
      if (!this.createKeyFileIfMissing) {
        throw new CtxindexSecretsError(
          'file secrets backend requires --passphrase, CTXINDEX_SECRETS_PASSPHRASE, or an existing secret.key file',
          'backend_unavailable',
        )
      }
      await ensureSecretKeyFile(this.configDirectory)
    }

    try {
      const key = await readFile(keyPath)
      await chmod(keyPath, 0o600).catch(() => undefined)
      if (key.byteLength !== 32) {
        throw new Error(`expected 32-byte secret.key, got ${key.byteLength}`)
      }
      return new Uint8Array(key)
    } catch (err) {
      throw wrapSecretsError(
        err,
        'failed to load file secrets key material',
        'backend_unavailable',
      )
    }
  }
}

export async function fileMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777
}
