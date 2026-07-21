import { describe, expect, test } from 'bun:test'
import { defaultConfig } from '@ctxindex/core/config'
import { loadExtensions } from '@ctxindex/core/extension'
import { resolveManagedOAuthApp } from '@ctxindex/core/oauth-app'
import type { AnyAdapterDefinition } from '@ctxindex/extension-sdk'
import {
  calendarEventProfile,
  fileProfile,
  mailMessageProfile,
} from '@ctxindex/profiles'
import * as builtinModule from './index'
import {
  CTXINDEX_BUILTIN_EXTENSIONS,
  CTXINDEX_MANAGED_OAUTH_APP_POLICIES,
  ctxindexGoogleOAuthApp,
  ctxindexMicrosoftOAuthApp,
  googleOAuthProvider,
  microsoftOAuthProvider,
} from './index'

describe('CTXINDEX_BUILTIN_EXTENSIONS', () => {
  test('publishes three ordinary provider integration roots with managed Apps on the same SDK graph', () => {
    expect(CTXINDEX_BUILTIN_EXTENSIONS.map(({ id }) => id)).toEqual([
      'ctxindex.google',
      'ctxindex.microsoft',
      'ctxindex.local',
    ])
    expect(
      CTXINDEX_BUILTIN_EXTENSIONS.map((extension) =>
        extension.adapters.map(({ id }) => id),
      ),
    ).toEqual([
      ['google.calendar', 'google.mailbox'],
      ['microsoft.calendar', 'microsoft.mailbox'],
      ['local.directory'],
    ])
    expect(
      CTXINDEX_BUILTIN_EXTENSIONS.map((extension) =>
        extension.oauthApps.map(({ provider, label }) => [provider.id, label]),
      ),
    ).toEqual([[['google', 'ctxindex']], [['microsoft', 'ctxindex']], []])
    expect(
      CTXINDEX_BUILTIN_EXTENSIONS.every(
        (extension) => !Object.hasOwn(extension, 'dependencies'),
      ),
    ).toBe(true)
    expect(
      CTXINDEX_BUILTIN_EXTENSIONS.every(
        (extension) => !Object.hasOwn(extension, 'version'),
      ),
    ).toBe(true)
  })

  test('binds managed Apps to exact Providers and host-owned bundled policy', () => {
    expect(ctxindexGoogleOAuthApp.provider).toBe(googleOAuthProvider)
    expect(ctxindexMicrosoftOAuthApp.provider).toBe(microsoftOAuthProvider)
    expect(CTXINDEX_MANAGED_OAUTH_APP_POLICIES).toEqual([
      {
        providerId: 'google',
        label: 'ctxindex',
        extensionId: 'ctxindex.google',
        distributions: [{ kind: 'bundled', packageName: '@ctxindex/adapters' }],
      },
      {
        providerId: 'microsoft',
        label: 'ctxindex',
        extensionId: 'ctxindex.microsoft',
        distributions: [{ kind: 'bundled', packageName: '@ctxindex/adapters' }],
      },
    ])
    expect(
      googleOAuthProvider.auth.registration.configSchema.safeParse(
        ctxindexGoogleOAuthApp.config,
      ).success,
    ).toBe(true)
    expect(
      microsoftOAuthProvider.auth.registration.configSchema.safeParse(
        ctxindexMicrosoftOAuthApp.config,
      ).success,
    ).toBe(true)
  })

  test('resolves both host policies against the actual bundled module provenance', async () => {
    const loaded = await loadExtensions({
      config: defaultConfig(),
      builtins: builtinModule,
    })

    expect(
      resolveManagedOAuthApp(
        loaded.completeRegistry,
        CTXINDEX_MANAGED_OAUTH_APP_POLICIES,
        'google',
      ),
    ).toEqual({ status: 'selected', providerId: 'google', label: 'ctxindex' })
    expect(
      resolveManagedOAuthApp(
        loaded.completeRegistry,
        CTXINDEX_MANAGED_OAUTH_APP_POLICIES,
        'microsoft',
      ),
    ).toEqual({
      status: 'selected',
      providerId: 'microsoft',
      label: 'ctxindex',
    })
  })

  test('keeps the canonical docs aligned with the bundled Profile inventory', async () => {
    const [specification, design] = await Promise.all([
      Bun.file(
        new URL(
          '../../../openspec/specs/profile-vocabulary/spec.md',
          import.meta.url,
        ),
      ).text(),
      Bun.file(
        new URL(
          '../../../docs/design/2026-07-13-context-access-layer.md',
          import.meta.url,
        ),
      ).text(),
    ])
    const inventory = '`mail.message@1`, `calendar.event@1`, and `file@1`'

    expect(specification).toContain(
      `The V1 bundled canonical Profiles MUST be ${inventory}.`,
    )
    expect(design).toContain(
      `Canonical Profiles bundled with the binary: ${inventory}.`,
    )
    expect(design).toContain(
      'V1 uses one primary Profile plus Artifact descriptors per Resource',
    )
    const bundledProfileLine = design
      .split('\n')
      .find((line) =>
        line.startsWith('Canonical Profiles bundled with the binary:'),
      )
    expect(bundledProfileLine).toBeDefined()
    expect(bundledProfileLine).not.toMatch(
      /communication\.conversation|`task`|`artifact`|`mbox`|`ics`/,
    )
  })

  test('composes exact shared Profiles without embedding definition docs', () => {
    const adapters = CTXINDEX_BUILTIN_EXTENSIONS.reduce<AnyAdapterDefinition[]>(
      (all, extension) => {
        all.push(...extension.adapters)
        return all
      },
      [],
    )
    expect(adapters.map(({ id }) => id)).toEqual([
      'google.calendar',
      'google.mailbox',
      'microsoft.calendar',
      'microsoft.mailbox',
      'local.directory',
    ])
    expect(adapters[0]?.profiles[0]).toBe(calendarEventProfile)
    expect(adapters[1]?.profiles[0]).toBe(mailMessageProfile)
    expect(adapters[2]?.profiles[0]).toBe(calendarEventProfile)
    expect(adapters[3]?.profiles[0]).toBe(mailMessageProfile)
    expect(adapters[4]?.profiles[0]).toBe(fileProfile)
    expect(
      [...CTXINDEX_BUILTIN_EXTENSIONS, ...adapters].every(
        (definition) => !Object.hasOwn(definition, 'docs'),
      ),
    ).toBe(true)
  })

  test('declares canonical Google OAuth and strict token-free configs', () => {
    const adapters = CTXINDEX_BUILTIN_EXTENSIONS.reduce<AnyAdapterDefinition[]>(
      (all, extension) => {
        all.push(...extension.adapters)
        return all
      },
      [],
    )
    const calendar = adapters.find(({ id }) => id === 'google.calendar')
    const gmail = adapters.find(({ id }) => id === 'google.mailbox')
    const local = adapters.find(({ id }) => id === 'local.directory')
    const microsoft = adapters.find(({ id }) => id === 'microsoft.mailbox')

    expect(gmail).toMatchObject({
      provider: {
        kind: 'provider',
        id: 'google',
        auth: {
          kind: 'oauth2',
          authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenUrl: 'https://oauth2.googleapis.com/token',
          baseScopes: ['openid', 'email'],
        },
      },
      access: {
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.compose',
        ],
      },
    })
    expect(gmail?.providerApiHosts).toEqual(['gmail.googleapis.com'])
    expect(calendar).toMatchObject({
      provider: { id: 'google' },
      access: {
        scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'],
      },
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
      gmail?.configSchema.safeParse({ access_token: 'malicious' }).success,
    ).toBe(false)
    expect(gmail?.configSchema.parse({})).toEqual({})
    expect(microsoft).toMatchObject({
      provider: { id: 'microsoft' },
      access: { scopes: ['Mail.ReadWrite'] },
    })
    expect(microsoft?.providerApiHosts).toEqual(['graph.microsoft.com'])
    expect(microsoft?.capabilities).toEqual([
      'search-remote',
      'retrieve',
      'download',
    ])
    expect(Object.keys(microsoft?.actions ?? {})).toEqual([
      'mail.message.draft.create',
      'mail.message.draft.update',
    ])
    expect(microsoft?.configSchema.safeParse({}).success).toBe(true)
    expect(
      microsoft?.configSchema.safeParse({ access_token: 'malicious' }).success,
    ).toBe(false)
    expect(local).not.toHaveProperty('provider')
    expect(local).not.toHaveProperty('access')
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
