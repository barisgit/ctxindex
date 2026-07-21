import { afterEach, expect, spyOn, test } from 'bun:test'
import { DaemonCliError, type DaemonSelection } from '../daemon/client'
import { handleSecretsCommand, type SecretsCommandDeps } from './secrets'

const selection = {} as DaemonSelection

function deps(overrides: Partial<SecretsCommandDeps> = {}): SecretsCommandDeps {
  return {
    selectDaemon: () => null,
    secretsStatus: async () => ({
      backend: 'file',
      backends: {
        file: { available: true, referenceCount: 0 },
        keychain: { available: false, referenceCount: 0 },
      },
    }),
    secretsBackendSet: async (_selection, input) => ({
      backend: input.target,
      copied: 0,
      cleaned: 0,
      cleanupPending: false,
      warnings: [],
    }),
    open: async () =>
      ({
        secretBackendManager: {
          getStatus: async () => {
            throw new Error('unexpected direct status')
          },
          switchBackend: async () => {
            throw new Error('unexpected direct switch')
          },
        },
        close: async () => {},
      }) as never,
    ...overrides,
  }
}

afterEach(() => {
  process.removeAllListeners('SIGINT')
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
})

test('selected daemon serves secret status without opening direct dependencies', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  let opened = false
  expect(
    await handleSecretsCommand(
      { kind: 'status', json: true },
      deps({
        selectDaemon: () => {
          throw new Error('legacy selection invoked')
        },
        ensureDaemonSelection: async () => ({
          status: 'selected',
          selection,
          started: true,
        }),
        secretsStatus: async (actual) => {
          expect(actual).toBe(selection)
          return {
            backend: 'file',
            backends: {
              file: { available: true, referenceCount: 2 },
              keychain: { available: false, referenceCount: 1 },
            },
          }
        },
        open: async () => {
          opened = true
          throw new Error('direct dependencies opened')
        },
      }),
    ),
  ).toBe(0)
  expect(opened).toBe(false)
  expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toEqual({
    backend: 'file',
    backends: {
      file: { available: true, referenceCount: 2 },
      keychain: { available: false, referenceCount: 1 },
    },
  })
})

test('selected daemon switches backend and preserves safe warnings', async () => {
  const log = spyOn(console, 'log').mockImplementation(() => {})
  const error = spyOn(console, 'error').mockImplementation(() => {})
  expect(
    await handleSecretsCommand(
      { kind: 'set', target: 'keychain' },
      deps({
        selectDaemon: () => selection,
        secretsBackendSet: async (actual, input) => {
          expect(actual).toBe(selection)
          expect(input).toEqual({ target: 'keychain' })
          return {
            backend: 'keychain',
            copied: 2,
            cleaned: 1,
            cleanupPending: true,
            warnings: ['Secret backend cleanup remains pending.'],
          }
        },
        open: async () => {
          throw new Error('selected daemon must not fall back')
        },
      }),
    ),
  ).toBe(0)
  expect(String(log.mock.calls[0]?.[0])).toBe(
    'secrets backend set to keychain; copied 2; cleaned 1; cleanup pending',
  )
  expect(String(error.mock.calls[0]?.[0])).toBe(
    'warning: Secret backend cleanup remains pending.',
  )
})

test('selected daemon failure never falls back to direct secret storage', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let opened = false
  expect(
    await handleSecretsCommand(
      { kind: 'status', json: false },
      deps({
        selectDaemon: () => selection,
        secretsStatus: async () => {
          throw new DaemonCliError({
            kind: 'ctxindex',
            taxonomy: 'other',
            code: 'backend_unavailable',
            message: 'The configured secret backend is unavailable.',
          })
        },
        open: async () => {
          opened = true
          throw new Error('direct dependencies opened')
        },
      }),
    ),
  ).toBe(50)
  expect(opened).toBe(false)
  expect(String(error.mock.calls[0]?.[0])).toBe(
    'The configured secret backend is unavailable.',
  )
})
