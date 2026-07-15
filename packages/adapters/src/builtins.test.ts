import { describe, expect, test } from 'bun:test'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { CTXINDEX_BUILTIN_EXTENSIONS } from './index'

describe('CTXINDEX_BUILTIN_EXTENSIONS', () => {
  test('describes declarative Gmail and local Source definitions', () => {
    const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
    const description = describeRegistry(registry)

    expect(
      description.sources.map(({ id, version, capabilities }) => ({
        id,
        version,
        capabilities,
      })),
    ).toEqual([
      {
        id: 'google.mailbox',
        version: 1,
        capabilities: ['search-remote', 'retrieve', 'download'],
      },
      { id: 'local.directory', version: 1, capabilities: [] },
    ])
    expect(
      registry.profiles.list().map(({ id, version }) => ({ id, version })),
    ).toEqual([{ id: 'communication.message', version: 1 }])
  })

  test('declares canonical Gmail OAuth and strict token-free configs', () => {
    const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
    const gmail = registry.adapters.get({ id: 'google.mailbox', version: 1 })
    const local = registry.adapters.get({ id: 'local.directory', version: 1 })

    expect(gmail?.auth).toEqual({
      kind: 'oauth2',
      provider: {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
      },
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    })
    expect(
      gmail?.configSchema.safeParse({ access_token: 'malicious' }).success,
    ).toBe(false)
    expect(local?.auth).toEqual({ kind: 'none' })
    expect(
      local?.configSchema.safeParse({
        root_path: '.',
        access_token: 'malicious',
      }).success,
    ).toBe(false)
  })
})
