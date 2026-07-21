import { describe, expect, test } from 'bun:test'
import { mailMessageProfile } from '@ctxindex/profiles'
import { googleOAuthProvider } from '../google-oauth-provider'
import { gmailSourceConfigSchema } from './config'
import { gmailAdapterDefinition } from './definition'

describe('Google mailbox definition', () => {
  test('imports the exact Provider/Profile and exposes only reversible Draft Actions', () => {
    expect(gmailAdapterDefinition).toMatchObject({
      id: 'google.mailbox',
      provider: googleOAuthProvider,
      access: {
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
        ],
      },
      providerApiHosts: ['gmail.googleapis.com'],
      profiles: [mailMessageProfile],
      routing: 'federated',
      capabilities: ['search-remote', 'retrieve', 'download'],
    })
    expect(gmailAdapterDefinition).not.toHaveProperty('version')
    expect(gmailAdapterDefinition).not.toHaveProperty('auth')
    expect(gmailAdapterDefinition.provider).toBe(googleOAuthProvider)
    expect(gmailAdapterDefinition.profiles[0]).toBe(mailMessageProfile)
    expect(Object.keys(gmailAdapterDefinition.actions)).toEqual([
      'mail.message.draft.create',
      'mail.message.draft.update',
    ])
    for (const binding of Object.values(gmailAdapterDefinition.actions)) {
      expect(binding.profile).toBe(mailMessageProfile)
      expect(binding.output).toBe(mailMessageProfile)
    }
    expect(JSON.stringify(gmailAdapterDefinition)).not.toMatch(
      /gmail\.send|message\.send/i,
    )
  })

  test('accepts only the empty strict Source config', () => {
    expect(gmailSourceConfigSchema.parse({})).toEqual({})
    expect(() => gmailSourceConfigSchema.parse({ extra: true })).toThrow()
  })
})
