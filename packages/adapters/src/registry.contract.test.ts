import { describe, expect, test } from 'bun:test'
import { CTXINDEX_ADAPTER_REGISTRY } from '@ctxindex/adapters'

describe('CTXINDEX_ADAPTER_REGISTRY', () => {
  test('contains exactly the bundled v1 adapters', () => {
    expect(CTXINDEX_ADAPTER_REGISTRY.adapterIds).toEqual([
      'local.directory',
      'google.mailbox',
    ])
    expect(CTXINDEX_ADAPTER_REGISTRY.listAdapterIds()).toEqual([
      'local.directory',
      'google.mailbox',
    ])
  })

  test('exposes the exact adapter migration namespaces', () => {
    expect(CTXINDEX_ADAPTER_REGISTRY.namespaces).toEqual([
      'local.directory',
      'google.mailbox',
    ])
    expect(CTXINDEX_ADAPTER_REGISTRY.getNamespaceForId('local.directory')).toBe(
      'local.directory',
    )
    expect(CTXINDEX_ADAPTER_REGISTRY.getNamespaceForId('google.mailbox')).toBe(
      'google.mailbox',
    )
  })

  test('lists only google.mailbox as an OAuth2 adapter', () => {
    expect(
      CTXINDEX_ADAPTER_REGISTRY.listOAuth2Adapters().map(
        (adapter) => adapter.id,
      ),
    ).toEqual(['google.mailbox'])
    expect(
      CTXINDEX_ADAPTER_REGISTRY.listOAuth2AdaptersByProvider('google').map(
        (adapter) => adapter.id,
      ),
    ).toEqual(['google.mailbox'])
    expect(
      CTXINDEX_ADAPTER_REGISTRY.getRequiredScopes('google.mailbox'),
    ).toEqual(['https://www.googleapis.com/auth/gmail.readonly'])
  })
})
