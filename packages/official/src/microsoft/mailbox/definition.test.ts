import { describe, expect, test } from 'bun:test'
import { mailMessageProfile } from '@ctxindex/profiles'
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
      profiles: [mailMessageProfile],
      routing: 'federated',
      capabilities: ['search-remote', 'retrieve', 'download'],
    })
    expect(microsoftMailboxAdapterDefinition).not.toHaveProperty('version')
    expect(microsoftMailboxAdapterDefinition).not.toHaveProperty('auth')
    expect(microsoftMailboxAdapterDefinition.provider).toBe(
      microsoftOAuthProvider,
    )
    expect(microsoftMailboxAdapterDefinition.profiles[0]).toBe(
      mailMessageProfile,
    )
    expect(Object.keys(microsoftMailboxAdapterDefinition.actions)).toEqual([
      'mail.message.draft.create',
      'mail.message.draft.update',
    ])
    for (const binding of Object.values(
      microsoftMailboxAdapterDefinition.actions,
    )) {
      expect(binding.profile).toBe(mailMessageProfile)
      expect(binding.output).toBe(mailMessageProfile)
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
