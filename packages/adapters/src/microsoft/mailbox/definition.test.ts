import { describe, expect, test } from 'bun:test'
import { microsoftOAuthProvider } from '../provider'
import { microsoftMailboxSourceConfigSchema } from './config'
import { microsoftMailboxAdapterDefinition } from './definition'

describe('Microsoft mailbox definition', () => {
  test('uses the shared provider and exposes read operations without premature mutations', () => {
    expect(microsoftMailboxAdapterDefinition).toMatchObject({
      id: 'microsoft.mailbox',
      version: 1,
      auth: {
        kind: 'oauth2',
        provider: microsoftOAuthProvider,
        scopes: ['Mail.ReadWrite'],
      },
      providerApiHosts: ['graph.microsoft.com'],
      profiles: [{ id: 'communication.message', version: 1 }],
      routing: 'federated',
      capabilities: ['search-remote', 'retrieve', 'download'],
      actions: {},
    })
  })

  test('accepts only the empty strict source config', () => {
    expect(microsoftMailboxSourceConfigSchema.parse({})).toEqual({})
    expect(() =>
      microsoftMailboxSourceConfigSchema.parse({ extra: true }),
    ).toThrow()
  })
})
