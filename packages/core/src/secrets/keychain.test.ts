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

  test('probe cleans its stable credential after a read failure', async () => {
    const values = new Map<string, string>()
    const accounts: string[] = []
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword() {
            throw new Error('PROBE-READ-FAILURE-CANARY')
          },
          async setPassword(service: string, account: string, value: string) {
            accounts.push(account)
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    const probe = backend.probeAvailable()
    await expect(probe).rejects.toMatchObject({
      code: 'backend_unavailable',
      message: 'keychain backend unavailable',
    })
    expect(accounts).toEqual(['__ctxindex_probe__'])
    expect(values.size).toBe(0)
    await expect(probe).rejects.not.toThrow('PROBE-READ-FAILURE-CANARY')
  })

  test('failed probe cleanup is retried through one stable credential', async () => {
    const values = new Map<string, string>()
    const accounts: string[] = []
    let failDelete = true
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            accounts.push(account)
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            if (failDelete) throw new Error('PROBE-DELETE-FAILURE-CANARY')
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    const firstProbe = backend.probeAvailable()
    await expect(firstProbe).rejects.toMatchObject({
      code: 'backend_unavailable',
      message: 'keychain backend unavailable',
    })
    expect(values.size).toBe(1)
    failDelete = false
    await expect(backend.probeAvailable()).resolves.toBeUndefined()
    expect(accounts).toEqual(['__ctxindex_probe__', '__ctxindex_probe__'])
    expect(values.size).toBe(0)
    await expect(firstProbe).rejects.not.toThrow('PROBE-DELETE-FAILURE-CANARY')
  })

  test('probe identity cannot collide with a normal scoped secret', async () => {
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
    const ref = await backend.setSecret(
      'probe',
      '__ctxindex_probe__',
      'REAL-SECRET-CANARY',
    )

    await expect(backend.probeAvailable()).resolves.toBeUndefined()

    await expect(backend.getSecret(ref)).resolves.toBe('REAL-SECRET-CANARY')
    expect(await backend.listKeys()).toEqual([
      { ref, scope: 'probe', key: '__ctxindex_probe__' },
    ])
  })

  test('concurrent writes across backend instances preserve every index entry', async () => {
    const values = new Map<string, string>()
    const keytar = {
      async getPassword(service: string, account: string) {
        const snapshot = values.get(`${service}\u0000${account}`) ?? null
        if (service === 'ctxindex' && account === '__ctxindex_keys__') {
          await Bun.sleep(10)
        }
        return snapshot
      },
      async setPassword(service: string, account: string, value: string) {
        values.set(`${service}\u0000${account}`, value)
      },
      async deletePassword(service: string, account: string) {
        return values.delete(`${service}\u0000${account}`)
      },
    } as unknown as KeytarShim
    const options = { importKeytar: async () => keytar }
    const first = new KeychainBackend(options)
    const second = new KeychainBackend(options)

    await Promise.all([
      first.setSecret('google', 'first', 'FIRST-CANARY'),
      second.setSecret('microsoft', 'second', 'SECOND-CANARY'),
    ])

    expect(await first.listKeys()).toEqual([
      {
        ref: 'keychain:ctxindex/google/first',
        scope: 'google',
        key: 'first',
      },
      {
        ref: 'keychain:ctxindex/microsoft/second',
        scope: 'microsoft',
        key: 'second',
      },
    ])
  })

  test('failed index publication does not leave an untracked new credential', async () => {
    const values = new Map<string, string>()
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            if (service === 'ctxindex' && account === '__ctxindex_keys__') {
              throw new Error('index unavailable')
            }
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    const write = backend.setSecret(
      'google',
      'new-secret',
      'UNTRACKED-SECRET-CANARY',
    )
    await expect(write).rejects.toMatchObject({ code: 'backend_unavailable' })
    expect(values.has('ctxindex/google\u0000new-secret')).toBe(false)
    await expect(write).rejects.not.toThrow('UNTRACKED-SECRET-CANARY')
  })

  test('credential write failure restores the prior index', async () => {
    const existing = {
      ref: 'keychain:ctxindex/existing/secret',
      scope: 'existing',
      key: 'secret',
    }
    const values = new Map<string, string>([
      ['ctxindex\u0000__ctxindex_keys__', JSON.stringify([existing])],
      ['ctxindex/existing\u0000secret', 'EXISTING-CANARY'],
    ])
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            if (service === 'ctxindex/google') {
              throw new Error('credential unavailable')
            }
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    const write = backend.setSecret(
      'google',
      'new-secret',
      'FAILED-WRITE-CANARY',
    )
    await expect(write).rejects.toMatchObject({ code: 'backend_unavailable' })
    expect(await backend.listKeys()).toEqual([existing])
    expect(values.has('ctxindex/google\u0000new-secret')).toBe(false)
    await expect(write).rejects.not.toThrow('FAILED-WRITE-CANARY')
  })

  test('credential and compensation failure keeps the intended entry discoverable and the primary error authoritative', async () => {
    const existing = {
      ref: 'keychain:ctxindex/existing/secret',
      scope: 'existing',
      key: 'secret',
    }
    const values = new Map<string, string>([
      ['ctxindex\u0000__ctxindex_keys__', JSON.stringify([existing])],
      ['ctxindex/existing\u0000secret', 'EXISTING-CANARY'],
    ])
    let indexWrites = 0
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            if (service === 'ctxindex/google') {
              throw new Error('PRIMARY-CREDENTIAL-FAILURE')
            }
            if (service === 'ctxindex' && account === '__ctxindex_keys__') {
              indexWrites += 1
              if (indexWrites === 2)
                throw new Error('COMPENSATION-FAILURE-CANARY')
            }
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    const failure = await backend
      .setSecret('google', 'new-secret', 'FAILED-WRITE-CANARY')
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(failure).toMatchObject({
      code: 'backend_unavailable',
      message: 'failed to write keychain secret',
      cause: { message: 'PRIMARY-CREDENTIAL-FAILURE' },
    })
    expect(await backend.listKeys()).toEqual([
      existing,
      {
        ref: 'keychain:ctxindex/google/new-secret',
        scope: 'google',
        key: 'new-secret',
      },
    ])
    expect(values.has('ctxindex/google\u0000new-secret')).toBe(false)
    expect(JSON.stringify(failure)).not.toMatch(
      /FAILED-WRITE-CANARY|COMPENSATION-FAILURE-CANARY|keychain:/,
    )
  })

  test('failed delete index mutation remains discoverable and retryable', async () => {
    const entry = {
      ref: 'keychain:ctxindex/google/old-secret',
      scope: 'google',
      key: 'old-secret',
    }
    const values = new Map<string, string>([
      ['ctxindex\u0000__ctxindex_keys__', JSON.stringify([entry])],
      ['ctxindex/google\u0000old-secret', 'DELETE-CANARY'],
    ])
    let failIndexWrite = true
    const backend = new KeychainBackend({
      importKeytar: async () =>
        ({
          async getPassword(service: string, account: string) {
            return values.get(`${service}\u0000${account}`) ?? null
          },
          async setPassword(service: string, account: string, value: string) {
            if (
              failIndexWrite &&
              service === 'ctxindex' &&
              account === '__ctxindex_keys__'
            ) {
              throw new Error('index unavailable')
            }
            values.set(`${service}\u0000${account}`, value)
          },
          async deletePassword(service: string, account: string) {
            return values.delete(`${service}\u0000${account}`)
          },
        }) as unknown as KeytarShim,
    })

    await expect(backend.deleteSecret(entry.ref)).rejects.toMatchObject({
      code: 'backend_unavailable',
    })
    expect(await backend.listKeys()).toEqual([entry])
    expect(values.has('ctxindex/google\u0000old-secret')).toBe(false)

    failIndexWrite = false
    await expect(backend.deleteSecret(entry.ref)).resolves.toBeUndefined()
    expect(await backend.listKeys()).toEqual([])
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
