import { expect, test } from 'bun:test'
import { ByteTransferStore, ByteTransferTooLargeError } from './transfer'

test('byte transfer tickets are opaque, single-use, and byte exact', () => {
  let now = 1_000
  const store = new ByteTransferStore({
    now: () => now,
    randomBytes: () => Uint8Array.from({ length: 32 }, (_, index) => index),
  })
  const bytes = Uint8Array.of(0, 255, 1)
  const transfer = store.create(bytes)

  expect(transfer).toEqual({
    ticket: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    byteSize: 3,
    expiresAt: 31_000,
  })
  expect(store.consume(transfer.ticket)).toEqual(bytes)
  expect(store.consume(transfer.ticket)).toBeNull()
  now += 1
})

test('byte transfer tickets expire and shutdown clears pending bytes', () => {
  let now = 1_000
  let sequence = 0
  const store = new ByteTransferStore({
    ttlMs: 10,
    now: () => now,
    randomBytes: () => Uint8Array.from({ length: 32 }, () => sequence++),
  })
  const expired = store.create(Uint8Array.of(1))
  now = expired.expiresAt
  expect(store.consume(expired.ticket)).toBeNull()

  const pending = store.create(Uint8Array.of(2))
  store.close()
  expect(store.consume(pending.ticket)).toBeNull()
})

test('concurrent pending transfers remain distinct and independently consumable', () => {
  let sequence = 0
  const store = new ByteTransferStore({
    randomBytes: () => Uint8Array.from({ length: 32 }, () => sequence++),
  })
  const first = store.create(Uint8Array.of(1))
  const second = store.create(Uint8Array.of(2))
  expect(first.ticket).not.toBe(second.ticket)
  expect(store.consume(second.ticket)).toEqual(Uint8Array.of(2))
  expect(store.consume(first.ticket)).toEqual(Uint8Array.of(1))
})

test('byte transfer rejects oversized payloads before retaining them', () => {
  const store = new ByteTransferStore({ maxBytes: 2 })
  expect(() => store.create(Uint8Array.of(1, 2, 3))).toThrow(
    ByteTransferTooLargeError,
  )
})
