import { describe, expect, test } from 'bun:test'
import { isGrantCompatible } from '@ctxindex/core/auth'
import {
  createExtensionRegistry,
  describeRegistry,
} from '@ctxindex/core/registry'
import { CTXINDEX_BUILTIN_EXTENSIONS } from './index'

describe('CTXINDEX_BUILTIN_EXTENSIONS', () => {
  test('describes declarative Google, Microsoft, and local Source definitions', () => {
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
        id: 'google.calendar',
        version: 1,
        capabilities: ['retrieve', 'sync'],
      },
      {
        id: 'google.mailbox',
        version: 1,
        capabilities: ['download', 'retrieve', 'search-remote'],
      },
      { id: 'local.directory', version: 1, capabilities: ['sync'] },
      {
        id: 'microsoft.calendar',
        version: 1,
        capabilities: ['retrieve', 'sync'],
      },
      {
        id: 'microsoft.mailbox',
        version: 1,
        capabilities: ['download', 'retrieve', 'search-remote'],
      },
    ])
    expect(
      registry.profiles.list().map(({ id, version }) => ({ id, version })),
    ).toEqual([
      { id: 'calendar.event', version: 1 },
      { id: 'communication.message', version: 1 },
      { id: 'file', version: 1 },
    ])
    const calendarKind = description.kinds.find(
      ({ id }) => id === 'calendar.event',
    )
    expect(calendarKind).toMatchObject({
      id: 'calendar.event',
      version: 1,
      summary: 'A provider-neutral calendar event or occurrence.',
      aliases: ['events'],
      formats: [],
    })
    expect(calendarKind?.fields.map(({ name }) => name)).toEqual([
      'allDay',
      'attendees',
      'calendarId',
      'endDate',
      'endsAt',
      'eventId',
      'organizer',
      'provider',
      'seriesEventId',
      'startDate',
      'startsAt',
      'status',
      'title',
      'updatedAt',
    ])
    const fileKind = description.kinds.find(({ id }) => id === 'file')
    expect(
      fileKind && {
        id: fileKind.id,
        version: fileKind.version,
        summary: fileKind.summary,
        aliases: fileKind.aliases,
        fields: fileKind.fields.map(({ name, type }) => ({ name, type })),
        formats: fileKind.formats,
      },
    ).toEqual({
      id: 'file',
      version: 1,
      summary: 'An extracted local file.',
      aliases: ['files'],
      fields: [
        { name: 'contentHash', type: 'string' },
        { name: 'extension', type: 'string' },
        { name: 'mediaType', type: 'string' },
        { name: 'modifiedAt', type: 'datetime' },
        { name: 'name', type: 'string' },
        { name: 'path', type: 'string' },
        { name: 'size', type: 'number' },
      ],
      formats: [],
    })
    expect(
      description.sources.find(({ id }) => id === 'google.calendar')?.profiles,
    ).toEqual([{ id: 'calendar.event', version: 1 }])
    expect(
      description.sources.find(({ id }) => id === 'microsoft.calendar')
        ?.profiles,
    ).toEqual([{ id: 'calendar.event', version: 1 }])
    expect(
      description.sources.find(({ id }) => id === 'local.directory')?.profiles,
    ).toEqual([{ id: 'file', version: 1 }])
    expect(
      description.actions.map(({ id, effect, adapters }) => ({
        id,
        effect,
        adapters,
      })),
    ).toEqual([
      {
        id: 'communication.message.draft.create',
        effect: 'reversible',
        adapters: [
          { id: 'google.mailbox', version: 1 },
          { id: 'microsoft.mailbox', version: 1 },
        ],
      },
      {
        id: 'communication.message.draft.update',
        effect: 'reversible',
        adapters: [
          { id: 'google.mailbox', version: 1 },
          { id: 'microsoft.mailbox', version: 1 },
        ],
      },
    ])
  })

  test('declares canonical Google OAuth and strict token-free configs', () => {
    const registry = createExtensionRegistry(CTXINDEX_BUILTIN_EXTENSIONS)
    const calendar = registry.adapters.get({
      id: 'google.calendar',
      version: 1,
    })
    const gmail = registry.adapters.get({ id: 'google.mailbox', version: 1 })
    const local = registry.adapters.get({ id: 'local.directory', version: 1 })
    const microsoft = registry.adapters.get({
      id: 'microsoft.mailbox',
      version: 1,
    })

    expect(gmail?.auth).toEqual({
      kind: 'oauth2',
      provider: {
        id: 'google',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        identity: {
          url: 'https://openidconnect.googleapis.com/v1/userinfo',
          subjectPath: ['sub'],
          labelPaths: [['email']],
          identities: [
            {
              kind: 'email',
              path: ['email'],
              verifiedPath: ['email_verified'],
            },
          ],
        },
        pkce: { method: 'S256', required: true },
        client: {
          type: 'public',
          secret: 'optional',
          tokenAuthMethod: 'client_secret_post',
        },
        baseScopes: ['openid', 'email'],
        environment: {
          clientId: 'CTXINDEX_GOOGLE_CLIENT_ID',
          clientSecret: 'CTXINDEX_GOOGLE_CLIENT_SECRET',
        },
        allowedHosts: [
          'accounts.google.com',
          'oauth2.googleapis.com',
          'openidconnect.googleapis.com',
        ],
        fixedAuthorizationParams: {
          access_type: 'offline',
          include_granted_scopes: 'false',
          prompt: 'consent',
        },
      },
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
      ],
    })
    expect(gmail?.providerApiHosts).toEqual(['gmail.googleapis.com'])
    expect(calendar?.auth).toMatchObject({
      kind: 'oauth2',
      provider: { id: 'google' },
      scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
    })
    expect(calendar?.providerApiHosts).toEqual(['www.googleapis.com'])
    expect(calendar?.capabilities).toEqual(['sync', 'retrieve'])
    expect(Object.keys(calendar?.actions ?? {})).toEqual([])
    expect(calendar?.configSchema.parse({})).toEqual({
      calendar_id: 'primary',
      past_days: 365,
      future_days: 730,
    })
    expect(
      gmail &&
        isGrantCompatible(gmail.auth, {
          provider: 'google',
          scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        }),
    ).toBe(false)
    expect(
      gmail &&
        isGrantCompatible(gmail.auth, {
          provider: 'google',
          scopes: JSON.stringify([
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.readonly',
          ]),
        }),
    ).toBe(true)
    expect(
      gmail?.configSchema.safeParse({ access_token: 'malicious' }).success,
    ).toBe(false)
    expect(microsoft?.auth).toMatchObject({
      kind: 'oauth2',
      provider: { id: 'microsoft' },
      scopes: ['Mail.ReadWrite'],
    })
    expect(microsoft?.providerApiHosts).toEqual(['graph.microsoft.com'])
    expect(microsoft?.capabilities).toEqual([
      'search-remote',
      'retrieve',
      'download',
    ])
    expect(Object.keys(microsoft?.actions ?? {})).toEqual([
      'communication.message.draft.create',
      'communication.message.draft.update',
    ])
    expect(microsoft?.configSchema.safeParse({}).success).toBe(true)
    expect(
      microsoft?.configSchema.safeParse({ access_token: 'malicious' }).success,
    ).toBe(false)
    expect(local?.auth).toEqual({ kind: 'none' })
    expect(local?.routing).toBe('indexed')
    expect(local?.capabilities).toEqual(['sync'])
    expect(Object.keys(local?.operations ?? {})).toEqual(['sync'])
    expect(local?.configSchema.safeParse({}).success).toBe(false)
    expect(
      local?.configSchema.safeParse({ root_path: 'relative' }).success,
    ).toBe(false)
    expect(
      local?.configSchema.safeParse({ root_path: '/tmp', include: [] }).success,
    ).toBe(false)
    expect(
      local?.configSchema.safeParse({ root_path: '/tmp', exclude: [''] })
        .success,
    ).toBe(false)
    expect(
      local?.configSchema.safeParse({ root_path: '/tmp', size_cap_bytes: 0 })
        .success,
    ).toBe(false)
    expect(
      local?.configSchema.safeParse({
        root_path: '/tmp',
        access_token: 'malicious',
      }).success,
    ).toBe(false)
  })
})
