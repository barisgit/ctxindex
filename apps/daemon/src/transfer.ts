import { randomBytes } from 'node:crypto'
import { RPC_BYTE_TRANSFER_MAX_BYTES } from '@ctxindex/rpc'

const DEFAULT_TTL_MS = 30_000
const TICKET_BYTES = 32
const TICKET_PATTERN = /^[a-f0-9]{64}$/

export interface ByteTransferDescriptor {
  readonly ticket: string
  readonly byteSize: number
  readonly expiresAt: number
}

export interface ByteTransferRegistry {
  create(bytes: Uint8Array): ByteTransferDescriptor
}

export interface ByteTransferConsumer {
  consume(ticket: string): Uint8Array | null
}

interface PendingTransfer {
  readonly bytes: Uint8Array
  readonly expiresAt: number
}

export class ByteTransferTooLargeError extends Error {}

export interface ByteTransferStoreOptions {
  readonly maxBytes?: number
  readonly ttlMs?: number
  readonly now?: () => number
  readonly randomBytes?: () => Uint8Array
}

export class ByteTransferStore
  implements ByteTransferRegistry, ByteTransferConsumer
{
  readonly #maxBytes: number
  readonly #ttlMs: number
  readonly #now: () => number
  readonly #randomBytes: () => Uint8Array
  readonly #pending = new Map<string, PendingTransfer>()
  #pendingBytes = 0

  constructor(options: ByteTransferStoreOptions = {}) {
    this.#maxBytes = options.maxBytes ?? RPC_BYTE_TRANSFER_MAX_BYTES
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.#now = options.now ?? Date.now
    this.#randomBytes = options.randomBytes ?? (() => randomBytes(TICKET_BYTES))
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes < 1)
      throw new RangeError('Byte transfer maximum must be a positive integer')
    if (!Number.isSafeInteger(this.#ttlMs) || this.#ttlMs < 1)
      throw new RangeError('Byte transfer TTL must be a positive integer')
  }

  create(bytes: Uint8Array): ByteTransferDescriptor {
    const now = this.#now()
    this.#prune(now)
    if (bytes.byteLength > this.#maxBytes - this.#pendingBytes)
      throw new ByteTransferTooLargeError()
    const expiresAt = now + this.#ttlMs
    if (!Number.isSafeInteger(expiresAt))
      throw new RangeError('Byte transfer expiry is invalid')
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const random = this.#randomBytes()
      if (random.byteLength !== TICKET_BYTES)
        throw new TypeError('Byte transfer entropy must contain 32 bytes')
      const ticket = Buffer.from(random).toString('hex')
      if (!TICKET_PATTERN.test(ticket) || this.#pending.has(ticket)) continue
      this.#pending.set(ticket, { bytes: bytes.slice(), expiresAt })
      this.#pendingBytes += bytes.byteLength
      return { ticket, byteSize: bytes.byteLength, expiresAt }
    }
    throw new Error('Unable to allocate a byte transfer ticket')
  }

  consume(ticket: string): Uint8Array | null {
    if (!TICKET_PATTERN.test(ticket)) return null
    const entry = this.#pending.get(ticket)
    this.#pending.delete(ticket)
    if (entry) this.#pendingBytes -= entry.bytes.byteLength
    if (!entry || entry.expiresAt <= this.#now()) return null
    return entry.bytes
  }

  close(): void {
    this.#pending.clear()
    this.#pendingBytes = 0
  }

  #prune(now: number): void {
    for (const [ticket, entry] of this.#pending) {
      if (entry.expiresAt <= now) {
        this.#pending.delete(ticket)
        this.#pendingBytes -= entry.bytes.byteLength
      }
    }
  }
}
