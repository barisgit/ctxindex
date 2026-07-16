import { describe, expect, test } from 'bun:test'
import { microsoftOAuthProvider } from '../provider'
import { microsoftMailboxSourceConfigSchema } from './config'
import { microsoftMailboxAdapterDefinition } from './definition'

describe('Microsoft mailbox definition', () => {
  test('uses the shared provider and exposes reads plus exactly the reversible Draft Actions', () => {
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
    })
    expect(Object.keys(microsoftMailboxAdapterDefinition.actions)).toEqual([
      'communication.message.draft.create',
      'communication.message.draft.update',
    ])
    expect(JSON.stringify(microsoftMailboxAdapterDefinition)).not.toMatch(
      /Mail\.Send|message\.send|\/send/i,
    )
  })

  test('accepts only the empty strict source config', () => {
    expect(microsoftMailboxSourceConfigSchema.parse({})).toEqual({})
    expect(() =>
      microsoftMailboxSourceConfigSchema.parse({ extra: true }),
    ).toThrow()
  })
})
