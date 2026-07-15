import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { CtxindexRegistryError } from './errors'
import {
  createCtxindexAdapterRegistry,
  createSourceAdapter,
} from './registry-core'
import type { SyncFunction } from './types'

const sync: SyncFunction = async function* syncStub() {
  if (Date.now() < 0) {
    yield { type: 'not_reached' }
  }
  await Promise.resolve()
}

const localAdapter = createSourceAdapter('local.directory', {
  provider: 'local',
  label: 'Local directory',
  schema: {},
  configSchema: z.object({}),
  capabilities: {
    kinds: ['directory'],
    modes: ['sync', 'resync', 'diff'],
    supportsResume: true,
    supportsAttachments: false,
    supportsRawRecords: false,
    supportsRealm: true,
  },
  auth: { kind: 'none' },
  sync,
  searchMode: 'indexed',
})

const googleAdapter = createSourceAdapter('google.mailbox', {
  provider: 'google',
  label: 'Google Mail (Gmail)',
  schema: {},
  configSchema: z.object({}),
  capabilities: {
    kinds: ['mailbox'],
    modes: ['sync', 'resync'],
    supportsResume: true,
    supportsAttachments: true,
    supportsRawRecords: true,
    supportsRealm: true,
  },
  auth: {
    kind: 'oauth2',
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientIdRef: 'keychain:ctxindex/google/oauth/client_id',
    clientSecretRef: 'keychain:ctxindex/google/oauth/client_secret',
  },
  sync,
  searchMode: 'hybrid',
  search: async () => [],
})

function makeRegistry() {
  return createCtxindexAdapterRegistry({
    'local.directory': localAdapter,
    'google.mailbox': googleAdapter,
  })
}

describe('createCtxindexAdapterRegistry', () => {
  test('narrows literal adapter ids through isKnownAdapter', () => {
    const registry = makeRegistry()
    const candidate: string = 'google.mailbox'

    expect(registry.isKnownAdapter(candidate)).toBe(true)

    if (registry.isKnownAdapter(candidate)) {
      const narrowed: (typeof registry.adapterIds)[number] = candidate
      expect(narrowed).toBe('google.mailbox')
      expect(registry.getAdapter(candidate)).toBe(googleAdapter)
    }
  })

  test('assertKnownAdapter throws a typed registry error for unknown ids', () => {
    const registry = makeRegistry()

    expect(() => registry.assertKnownAdapter('missing.adapter')).toThrow(
      CtxindexRegistryError,
    )

    const assertKnownAdapter: (
      value: string,
    ) => asserts value is (typeof registry.adapterIds)[number] =
      registry.assertKnownAdapter

    try {
      assertKnownAdapter('missing.adapter')
    } catch (error) {
      expect(error).toBeInstanceOf(CtxindexRegistryError)
      expect((error as CtxindexRegistryError).code).toBe(
        'registry_unknown_adapter',
      )
    }
  })

  test('getAdapter returns the typed adapter definition', () => {
    const registry = makeRegistry()
    const adapter = registry.getAdapter('google.mailbox')

    expect(adapter.id).toBe('google.mailbox')
    expect(adapter.provider).toBe('google')
    expect(adapter.auth.kind).toBe('oauth2')
  })

  test('groups adapters by provider and kind', () => {
    const registry = makeRegistry()

    expect(
      registry.getAdaptersByProvider('google').map((adapter) => adapter.id),
    ).toEqual(['google.mailbox'])
    expect(
      registry.getAdaptersByKind('mailbox').map((adapter) => adapter.id),
    ).toEqual(['google.mailbox'])
  })

  test('reports capabilities and required OAuth scopes', () => {
    const registry = makeRegistry()

    expect(registry.supportsMode('local.directory', 'diff')).toBe(true)
    expect(registry.supportsMode('google.mailbox', 'diff')).toBe(false)
    expect(registry.getRequiredScopes('google.mailbox')).toEqual([
      'https://www.googleapis.com/auth/gmail.readonly',
    ])
    expect(registry.getRequiredScopes('local.directory')).toBeNull()
  })

  test('exposes search mode and search capability lookups', () => {
    const registry = makeRegistry()

    expect(registry.getSearchMode('local.directory')).toBe('indexed')
    expect(registry.getSearchMode('google.mailbox')).toBe('hybrid')
    expect(registry.getSearchFn('local.directory')).toBeUndefined()
    expect(typeof registry.getSearchFn('google.mailbox')).toBe('function')
    expect(
      registry.listFederatedAdapters().map((adapter) => adapter.id),
    ).toEqual(['google.mailbox'])
  })

  test('createSourceAdapter rejects federated/hybrid definitions without search', () => {
    expect(() =>
      createSourceAdapter('broken.federated', {
        provider: 'local',
        label: 'Broken',
        schema: {},
        configSchema: z.object({}),
        capabilities: localAdapter.capabilities,
        auth: { kind: 'none' },
        sync,
        searchMode: 'federated',
      }),
    ).toThrow(CtxindexRegistryError)
  })

  test('registerAdapter and unregisterAdapter round-trip through the overlay', () => {
    const registry = makeRegistry()
    const adapterIds = registry.listAdapterIds()
    const overlayAdapter = createSourceAdapter('google.mailbox', {
      provider: 'google',
      label: 'Overlay Gmail',
      schema: {},
      configSchema: z.object({}),
      capabilities: googleAdapter.capabilities,
      auth: googleAdapter.auth,
      sync,
      searchMode: 'hybrid',
      search: async () => [],
    })

    expect(registry.registerAdapter(overlayAdapter)).toBeUndefined()
    expect(registry.getAdapter('google.mailbox')).toBe(overlayAdapter)
    expect(registry.adapters['google.mailbox']).toBe(googleAdapter)
    expect(registry.listAdapterIds()).toEqual(adapterIds)

    expect(registry.unregisterAdapter('google.mailbox')).toBe(overlayAdapter)
    expect(registry.getAdapter('google.mailbox')).toBe(googleAdapter)
    expect(registry.unregisterAdapter('google.mailbox')).toBeUndefined()
  })
})
