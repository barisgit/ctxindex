import { describe, expect, test } from 'bun:test'
import { communicationMessageProfile } from '@ctxindex/profiles'
import { microsoftOAuthProvider } from '../provider'
import { microsoftMailboxSourceConfigSchema } from './config'
import { microsoftMailboxAdapterDefinition } from './definition'

describe('Microsoft mailbox definition', () => {
  test('uses the shared provider and exposes reads plus exactly the reversible Draft Actions', () => {
    expect(microsoftMailboxAdapterDefinition).toMatchObject({
      id: 'microsoft.mailbox',
      provider: microsoftOAuthProvider,
      access: { scopes: ['Mail.ReadWrite'] },
      providerApiHosts: ['graph.microsoft.com'],
      profiles: [communicationMessageProfile],
      routing: 'federated',
      capabilities: ['search-remote', 'retrieve', 'download'],
    })
    expect(microsoftMailboxAdapterDefinition).not.toHaveProperty('version')
    expect(microsoftMailboxAdapterDefinition).not.toHaveProperty('auth')
    expect(microsoftMailboxAdapterDefinition.provider).toBe(
      microsoftOAuthProvider,
    )
    expect(microsoftMailboxAdapterDefinition.profiles[0]).toBe(
      communicationMessageProfile,
    )
    expect(Object.keys(microsoftMailboxAdapterDefinition.actions)).toEqual([
      'communication.message.draft.create',
      'communication.message.draft.update',
    ])
    for (const binding of Object.values(
      microsoftMailboxAdapterDefinition.actions,
    )) {
      expect(binding.profile).toBe(communicationMessageProfile)
      expect(binding.output).toBe(communicationMessageProfile)
    }
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
