import { describe, expect, test } from 'bun:test'
import { KeychainBackend } from './keychain'
import { CtxindexSecretsError } from './types'

type KeytarShim = typeof import('keytar')

describe('KeychainBackend', () => {
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
