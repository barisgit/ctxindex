import { describe, expect, test } from 'bun:test'
import { KeychainBackend } from './keychain'
import { CtxindexSecretsError } from './types'

type KeytarShim = typeof import('keytar')

describe('KeychainBackend', () => {
  test('test processes require an explicit mock before native Keychain access', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    const previousMock = process.env.CTXINDEX_KEYTAR_MOCK_FILE
    const previousLive = process.env.CTXINDEX_LIVE_TESTS
    process.env.NODE_ENV = 'test'
    delete process.env.CTXINDEX_KEYTAR_MOCK_FILE
    delete process.env.CTXINDEX_LIVE_TESTS

    try {
      await expect(
        new KeychainBackend().probeAvailable(),
      ).rejects.toMatchObject({ code: 'backend_unavailable' })
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
      if (previousMock === undefined)
        delete process.env.CTXINDEX_KEYTAR_MOCK_FILE
      else process.env.CTXINDEX_KEYTAR_MOCK_FILE = previousMock
      if (previousLive === undefined) delete process.env.CTXINDEX_LIVE_TESTS
      else process.env.CTXINDEX_LIVE_TESTS = previousLive
    }
  })

  test('key index uses deterministic code-unit ordering', async () => {
    const values = new Map<string, string>()
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    await backend.setSecret('a', 'key', 'a')
    await backend.setSecret('_', 'key', '_')
    await backend.setSecret('A', 'key', 'A')

    expect((await backend.listKeys()).map((entry) => entry.ref)).toEqual([
      'keychain:ctxindex/A/key',
      'keychain:ctxindex/_/key',
      'keychain:ctxindex/a/key',
    ])
  })

  test('wraps keytar import failure as backend_unavailable', async () => {
    const backend = new KeychainBackend({
      importKeytar: async () => {
        throw new Error('native binding missing')
      },
    })

    await expect(
      backend.getSecret('keychain:ctxindex/scope/key'),
    ).rejects.toBeInstanceOf(CtxindexSecretsError)
    await expect(
      backend.getSecret('keychain:ctxindex/scope/key'),
    ).rejects.toMatchObject({ code: 'backend_unavailable' })
  })

  test('wraps keytar runtime failure as backend_unavailable', async () => {
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword() {
            throw new Error('keychain locked')
          },
        }) as unknown as KeytarShim,
    })

    await expect(
      backend.getSecret('keychain:ctxindex/scope/key'),
    ).rejects.toMatchObject({ code: 'backend_unavailable' })
  })

  test('maps missing keychain entry to not_found', async () => {
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword() {
            return null
          },
        }) as unknown as KeytarShim,
    })

    await expect(
      backend.getSecret('keychain:ctxindex/scope/key'),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
