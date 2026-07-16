import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
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
import { hkdf } from '@noble/hashes/hkdf.js'
import { hmac } from '@noble/hashes/hmac.js'
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { getEnv } from '../config/env-loader'
import { configDir, dataDir } from '../paths'
import {
  CtxindexSecretsError,
  encodeSecretPart,
  fileRef,
  parseSecretRef,
  type SecretsStore,
  wrapSecretsError,
} from './types'

const boxFileName = 'secrets.box'
const keyFileName = 'secret.key'
const kdfIters = 200_000
const keyCheckContext = textBytes('ctxindex/secrets.box/v2/key-check')
const boxMacContext = textBytes('ctxindex/secrets.box/v2/box-mac')

type FileKdf = 'pbkdf2-sha256'
type FileKeyMode = 'passphrase' | 'key-file'

interface SecretRecord {
  readonly scope: string
  readonly key: string
  readonly value: string
}

function recordId(scope: string, key: string): string {
  return `${encodeSecretPart(scope)}/${encodeSecretPart(key)}`
}

interface SecretsPlaintext {
  readonly records: Record<string, SecretRecord>
}

interface SecretsEnvelope {
  readonly v: 2
  readonly keyMode: FileKeyMode
  readonly nonce: string
  readonly salt?: string
  readonly kdf: FileKdf | 'none'
  readonly iters?: number
  readonly keyCheck: string
  readonly boxMac: string
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

function keyedDigest(
  key: Uint8Array,
  context: Uint8Array,
  value: Uint8Array,
): Uint8Array {
  const macKey = hkdf(sha256, key, undefined, context, 32)
  return hmac(sha256, macKey, value)
}

function digestMatches(expected: Uint8Array, encoded: string): boolean {
  const actual = fromBase64(encoded)
  return (
    actual.byteLength === expected.byteLength &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
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
  try {
    await writeFile(path, randomBytes(32), { mode: 0o600, flag: 'wx' })
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause
  }
  await chmod(path, 0o600).catch(() => undefined)
  return path
}

export async function hasFileSecretMaterial(
  options: Pick<FileBackendOptions, 'passphrase' | 'configDirectory'> = {},
): Promise<boolean> {
  if (options.passphrase || getEnv().CTXINDEX_SECRETS_PASSPHRASE) return true
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

  async probeAvailable(): Promise<void> {
    if (await exists(this.path)) {
      await this.readValidatedEnvelope()
      return
    }
    await this.writeEnvelopeKey()
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
    const record = records[recordId(parsed.scope, parsed.key)]
    if (!record) {
      throw new CtxindexSecretsError(`secret not found: ${ref}`, 'not_found')
    }
    return record.value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const records = await this.readRecords()
    records[recordId(scope, key)] = { scope, key, value }
    await this.writeRecords(records)
    return fileRef(scope, key)
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
    delete records[recordId(parsed.scope, parsed.key)]
    await this.writeRecords(records)
  }

  async listKeys(): Promise<{ ref: string; scope: string; key: string }[]> {
    const records = await this.readRecords()
    return Object.values(records)
      .map((record) => ({
        ref: fileRef(record.scope, record.key),
        scope: record.scope,
        key: record.key,
      }))
      .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0))
  }

  private async readRecords(): Promise<Record<string, SecretRecord>> {
    if (!(await exists(this.path))) return {}

    try {
      const { envelope, key, ciphertext } = await this.readValidatedEnvelope()
      const cipher = xchacha20poly1305(key, fromBase64(envelope.nonce))
      const plaintext = cipher.decrypt(ciphertext)
      const decoded = JSON.parse(decodeText(plaintext)) as SecretsPlaintext
      return decoded.records ?? {}
    } catch (cause) {
      throw wrapSecretsError(
        cause,
        'failed to decrypt secrets.box',
        'decrypt_failed',
      )
    }
  }

  private async writeRecords(
    records: Record<string, SecretRecord>,
  ): Promise<void> {
    const nonce = randomBytes(24)
    const existing = (await exists(this.path))
      ? await this.readValidatedEnvelope()
      : undefined
    const keyMaterial = existing
      ? {
          keyMode: existing.envelope.keyMode,
          key: existing.key,
          ...(existing.envelope.salt
            ? { salt: fromBase64(existing.envelope.salt) }
            : {}),
        }
      : await this.writeEnvelopeKey()
    const cipher = xchacha20poly1305(keyMaterial.key, nonce)
    const plaintext = textBytes(
      JSON.stringify({ records } satisfies SecretsPlaintext),
    )
    const encrypted = cipher.encrypt(plaintext)
    const envelope: SecretsEnvelope = {
      v: 2,
      keyMode: keyMaterial.keyMode,
      nonce: toBase64(nonce),
      kdf: keyMaterial.keyMode === 'passphrase' ? 'pbkdf2-sha256' : 'none',
      ...(keyMaterial.salt
        ? { salt: toBase64(keyMaterial.salt), iters: kdfIters }
        : {}),
      keyCheck: toBase64(
        keyedDigest(keyMaterial.key, keyCheckContext, keyCheckContext),
      ),
      boxMac: toBase64(keyedDigest(keyMaterial.key, boxMacContext, encrypted)),
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

  private async readValidatedEnvelope(): Promise<{
    readonly envelope: SecretsEnvelope
    readonly key: Uint8Array
    readonly ciphertext: Uint8Array
  }> {
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
      if (
        envelope.v !== 2 ||
        (envelope.keyMode !== 'passphrase' &&
          envelope.keyMode !== 'key-file') ||
        (envelope.keyMode === 'passphrase' &&
          envelope.kdf !== 'pbkdf2-sha256') ||
        (envelope.keyMode === 'key-file' && envelope.kdf !== 'none') ||
        typeof envelope.keyCheck !== 'string' ||
        typeof envelope.boxMac !== 'string'
      ) {
        throw new Error('unsupported secrets.box version or key mode')
      }
      const encodedCiphertext = envelope.entries.box
      if (!encodedCiphertext) throw new Error('missing encrypted entries box')

      const key = await this.readEnvelopeKey(envelope)
      const ciphertext = fromBase64(encodedCiphertext)
      if (
        !digestMatches(
          keyedDigest(key, keyCheckContext, keyCheckContext),
          envelope.keyCheck,
        )
      ) {
        throw new Error('secrets.box key check failed')
      }
      if (
        !digestMatches(
          keyedDigest(key, boxMacContext, ciphertext),
          envelope.boxMac,
        )
      ) {
        throw new Error('secrets.box integrity check failed')
      }
      return { envelope, key, ciphertext }
    } catch (cause) {
      throw wrapSecretsError(
        cause,
        'failed to validate secrets.box',
        'decrypt_failed',
      )
    }
  }

  private async writeEnvelopeKey(): Promise<{
    readonly keyMode: FileKeyMode
    readonly key: Uint8Array
    readonly salt?: Uint8Array
  }> {
    const passphrase = this.passphrase ?? getEnv().CTXINDEX_SECRETS_PASSPHRASE
    if (passphrase) {
      const salt = randomBytes(16)
      return {
        keyMode: 'passphrase',
        key: this.derivePassphraseKey(passphrase, salt),
        salt,
      }
    }

    return { keyMode: 'key-file', key: await this.readKeyFile() }
  }

  private async readEnvelopeKey(
    envelope: SecretsEnvelope,
  ): Promise<Uint8Array> {
    if (envelope.keyMode === 'key-file') return this.readKeyFile()

    const passphrase = this.passphrase ?? getEnv().CTXINDEX_SECRETS_PASSPHRASE
    if (!passphrase) {
      throw new CtxindexSecretsError(
        'passphrase-encrypted secrets.box requires CTXINDEX_SECRETS_PASSPHRASE',
        'backend_unavailable',
      )
    }
    if (!envelope.salt || envelope.iters !== kdfIters) {
      throw new CtxindexSecretsError(
        'invalid passphrase secrets envelope',
        'decrypt_failed',
      )
    }
    return this.derivePassphraseKey(passphrase, fromBase64(envelope.salt))
  }

  private derivePassphraseKey(
    passphrase: string,
    salt: Uint8Array,
  ): Uint8Array {
    return pbkdf2(sha256, textBytes(passphrase), salt, {
      c: kdfIters,
      dkLen: 32,
    })
  }

  private async readKeyFile(): Promise<Uint8Array> {
    const keyPath = secretKeyPath(this.configDirectory)
    if (!(await exists(keyPath))) {
      if (!this.createKeyFileIfMissing) {
        throw new CtxindexSecretsError(
          'file secrets backend requires CTXINDEX_SECRETS_PASSPHRASE or an existing secret.key file',
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
