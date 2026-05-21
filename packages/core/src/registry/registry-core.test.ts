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
  migrations: {
    namespace: 'local.directory',
    migrationsFolder: '/tmp/local-directory',
    migrationsTable: 'ctxindex_migrations_local_directory',
  },
  auth: { kind: 'none' },
  sync,
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
  migrations: {
    namespace: 'google.mailbox',
    migrationsFolder: '/tmp/google-mailbox',
    migrationsTable: 'ctxindex_migrations_google_mailbox',
  },
  auth: {
    kind: 'oauth2',
    provider: 'google',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientIdRef: 'keychain:ctxindex/google/oauth/client_id',
    clientSecretRef: 'keychain:ctxindex/google/oauth/client_secret',
  },
  sync,
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

  test('lists migrations and groups adapters by provider and kind', () => {
    const registry = makeRegistry()

    expect(registry.listMigrations()).toHaveLength(2)
    expect(
      registry.listMigrations().map((migration) => migration.namespace),
    ).toEqual(['local.directory', 'google.mailbox'])
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

  test('registerAdapter and unregisterAdapter round-trip through the overlay', () => {
    const registry = makeRegistry()
    const adapterIds = registry.listAdapterIds()
    const overlayAdapter = createSourceAdapter('google.mailbox', {
      provider: 'google',
      label: 'Overlay Gmail',
      schema: {},
      configSchema: z.object({}),
      capabilities: googleAdapter.capabilities,
      migrations: googleAdapter.migrations,
      auth: googleAdapter.auth,
      sync,
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
