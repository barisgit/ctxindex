import { expect, spyOn, test } from 'bun:test'
import { loadCliDefinitions } from '../definitions'
import {
  type DirectDatabaseOwnership,
  PrototypeUnsupportedError,
} from '../direct-database'
import { handleOAuthAppCommand } from './handle-oauth-app-command'

function fakeOwnership(events: string[]): DirectDatabaseOwnership {
  return {
    target: '/tmp/ctxindex-oauth-app-owner.sqlite',
    async readLocalOAuthAppIdentities() {
      events.push('read-identities')
      return []
    },
    async readDirectExtensionSourceBindings() {
      throw new Error('Source bindings read outside dependency composition')
    },
    async open() {
      throw new Error('ownership opened outside dependency composition')
    },
    close() {
      events.push('close-owner')
    },
  }
}

test('OAuth App add retains one ownership and definition snapshot through persistence', async () => {
  const loaded = await loadCliDefinitions()
  const events: string[] = []
  const ownership = fakeOwnership(events)
  const output = spyOn(console, 'log').mockImplementation(() => {})
  let definitionLoads = 0
  try {
    const exit = await handleOAuthAppCommand(
      { kind: 'add', provider: 'google', label: 'work' },
      {
        acquireOwnership: () => {
          events.push('acquire-owner')
          return ownership
        },
        loadDefinitions: async (options) => {
          if (!options) throw new Error('definition options are required')
          definitionLoads += 1
          events.push('load-definitions')
          expect(options.localOAuthAppIdentities).toEqual([])
          return loaded
        },
        assertInitialized: async () => {
          events.push('assert-initialized')
        },
        readEnvironmentVariable: (name) => {
          events.push(`read-env:${name}`)
          return `value-for-${name}`
        },
        open: async (options) => {
          events.push('compose-deps')
          if (!options) throw new Error('direct options are required')
          expect(options.databaseOwnership).toBe(ownership)
          expect(options.definitions).toBe(loaded)
          return {
            oauthAppService: {
              listApps: () => [],
              addLocalApp: async () => events.push('persist-app'),
            },
            close: async () => events.push('close-deps'),
          } as never
        },
      },
    )

    expect(exit).toBe(0)
    expect(definitionLoads).toBe(1)
    expect(events).toEqual([
      'acquire-owner',
      'read-identities',
      'load-definitions',
      'assert-initialized',
      'read-env:CTXINDEX_GOOGLE_CLIENT_ID',
      'read-env:CTXINDEX_GOOGLE_CLIENT_SECRET',
      'compose-deps',
      'persist-app',
      'close-deps',
      'close-owner',
    ])
  } finally {
    output.mockRestore()
  }
})

test('OAuth App ownership conflict fails before Extension definition loading', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let loadedDefinitions = false
  try {
    const exit = await handleOAuthAppCommand(
      { kind: 'add', provider: 'google', label: 'work' },
      {
        acquireOwnership: () => {
          throw new PrototypeUnsupportedError()
        },
        loadDefinitions: async () => {
          loadedDefinitions = true
          throw new Error('definitions loaded without ownership')
        },
        assertInitialized: async () => {},
        readEnvironmentVariable: () => undefined,
        open: async () => {
          throw new Error('direct dependencies opened without ownership')
        },
      },
    )

    expect(exit).toBe(50)
    expect(loadedDefinitions).toBe(false)
  } finally {
    error.mockRestore()
  }
})

test('OAuth App add reads invocation-current environment then uses the ensured daemon', async () => {
  const loaded = await loadCliDefinitions()
  const output = spyOn(console, 'log').mockImplementation(() => {})
  const events: string[] = []
  try {
    const exit = await handleOAuthAppCommand(
      { kind: 'add', provider: 'google', label: 'work' },
      {
        acquireOwnership: () => {
          throw new Error('direct ownership acquired')
        },
        loadDefinitions: async () => {
          events.push('definitions')
          return loaded
        },
        assertInitialized: async () => {
          events.push('initialized')
        },
        readEnvironmentVariable: (name) => {
          events.push(`env:${name}`)
          return `value-for-${name}`
        },
        open: async () => {
          throw new Error('direct dependencies opened')
        },
        selectDaemon: () => ({ selectedBy: 'test_override' }) as never,
        ensureDaemonSelection: async () => ({
          status: 'selected',
          selection: { selectedBy: 'test_override' } as never,
          started: false,
        }),
        daemonOAuthAppRegistration: async () => ({
          environment: {
            clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
            clientSecret: 'CTXINDEX_GOOGLE_CLIENT_SECRET',
          },
        }),
        daemonOAuthAppAdd: async (_selection, input) => {
          events.push(`add:${input.provider}:${input.label}`)
          expect(input.config).toEqual({
            clientId: 'value-for-CTXINDEX_GOOGLE_CLIENT_ID',
            clientSecret: 'value-for-CTXINDEX_GOOGLE_CLIENT_SECRET',
          })
          return { providerId: input.provider, label: input.label }
        },
      },
    )
    expect(exit).toBe(0)
    expect(events).toEqual([
      'definitions',
      'initialized',
      'env:CTXINDEX_GOOGLE_CLIENT_ID',
      'env:CTXINDEX_GOOGLE_CLIENT_SECRET',
      'add:google:work',
    ])
  } finally {
    output.mockRestore()
  }
})
