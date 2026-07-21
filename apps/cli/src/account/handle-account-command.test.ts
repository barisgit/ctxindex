import { afterEach, expect, spyOn, test } from 'bun:test'
import * as builtinModule from '@ctxindex/adapters'
import { defaultConfig } from '@ctxindex/core/config'
import {
  CtxindexAuthError,
  CtxindexValidationError,
} from '@ctxindex/core/errors'
import { loadExtensions } from '@ctxindex/core/extension'
import type {
  ManagedOAuthAppPolicy,
  ManagedOAuthAppResolution,
} from '@ctxindex/core/oauth-app'
import type { CompleteRegistry } from '@ctxindex/core/registry'
import {
  type AccountCommandRuntime,
  formatAccountCommandError,
  handleAccountCommand,
  resolveAccountOAuthAppLabel,
} from './handle-account-command'

const registry = {} as CompleteRegistry
const policies = [] as readonly ManagedOAuthAppPolicy[]
const completeRegistry = (
  await loadExtensions({ config: defaultConfig(), builtins: builtinModule })
).completeRegistry

afterEach(() => {
  spyOn(console, 'error').mockRestore()
})

function commandRuntime(
  overrides: Partial<AccountCommandRuntime>,
): AccountCommandRuntime {
  const unused = async () => {
    throw new Error('unexpected dependency call')
  }
  return {
    assertInitialized: async () => {},
    loadAuthDefinitionDeps: unused,
    openAccountDeps: unused,
    openDeps: unused,
    authorizeProvider: unused,
    ...overrides,
  } as AccountCommandRuntime
}

function openedDeps(
  resolveApp: (providerId: string, label: string) => Promise<unknown>,
) {
  return {
    completeRegistry,
    oauthAppService: {
      resolveApp,
      listApps: () => [],
    },
    authService: {},
    close: async () => {},
  } as unknown as Awaited<ReturnType<AccountCommandRuntime['openDeps']>>
}

function managedResolution(
  resolution: ManagedOAuthAppResolution,
  calls: string[],
) {
  return {
    policies,
    resolve: (
      _registry: CompleteRegistry,
      _policies: readonly ManagedOAuthAppPolicy[],
      providerId: string,
    ) => {
      calls.push(providerId)
      return resolution
    },
  }
}

test('explicit App label bypasses managed resolution unchanged', () => {
  const calls: string[] = []
  expect(
    resolveAccountOAuthAppLabel(
      registry,
      'google',
      'Local App',
      managedResolution(
        { status: 'selected', providerId: 'google', label: 'managed' },
        calls,
      ),
    ),
  ).toBe('Local App')
  expect(calls).toEqual([])
})

test('omitted App delegates managed selection and returns its exact label', () => {
  const calls: string[] = []
  expect(
    resolveAccountOAuthAppLabel(
      registry,
      'google',
      undefined,
      managedResolution(
        { status: 'selected', providerId: 'google', label: 'managed' },
        calls,
      ),
    ),
  ).toBe('managed')
  expect(calls).toEqual(['google'])
})

test.each([
  {
    status: 'unavailable',
    providerId: 'google',
    reason: 'not_configured',
  },
  {
    status: 'unavailable',
    providerId: 'google',
    reason: 'not_active',
  },
  {
    status: 'unavailable',
    providerId: 'google',
    reason: 'provenance_mismatch',
  },
  {
    status: 'invalid_policy',
    providerId: 'google',
    reason: 'ambiguous',
  },
] as const)('managed $status/$reason failure is safe invalid selection with BYOA guidance', (resolution) => {
  const attempt = () =>
    resolveAccountOAuthAppLabel(
      registry,
      'google',
      undefined,
      managedResolution(resolution, []),
    )

  expect(attempt).toThrow('bun cli oauth-app add google <label> --from-env')
  expect(attempt).toThrow('bun cli account add google --app <label>')
  try {
    attempt()
  } catch (error) {
    expect(error).toMatchObject({ code: 'invalid_oauth_selection' })
    expect(String(error)).not.toMatch(
      /client.?id|secret|token|authorization.?code|verifier|state=/i,
    )
  }
})

test('implicit App resolution failure appends static BYOA commands without changing the error', () => {
  const error = Object.assign(
    new Error('Provider denied the requested scopes'),
    {
      code: 'insufficient_scope',
    },
  )

  expect(formatAccountCommandError(error, 'google')).toBe(
    [
      'Provider denied the requested scopes',
      'Configure a local OAuth App with: bun cli oauth-app add google <label> --from-env. Then authorize with: bun cli account add google --app <label>',
    ].join('\n'),
  )
  expect(error.code).toBe('insufficient_scope')
})

test('authorization failure after implicit App resolution does not add BYOA guidance', () => {
  expect(
    formatAccountCommandError(
      new Error('Provider denied the requested scopes'),
    ),
  ).toBe('Provider denied the requested scopes')
})

test('implicit command keeps one fallback for exact App resolution failure', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  let authorizations = 0
  const exit = await handleAccountCommand(
    { kind: 'add', provider: 'google' },
    commandRuntime({
      openDeps: async () =>
        openedDeps(async () => {
          throw new CtxindexValidationError(
            'invalid_oauth_selection',
            'fixture App resolution failed',
          )
        }),
      authorizeProvider: async () => {
        authorizations += 1
        throw new Error('must not authorize')
      },
    }),
  )

  expect(exit).toBe(2)
  expect(authorizations).toBe(0)
  const output = String(error.mock.calls[0]?.[0])
  expect(output.match(/oauth-app add google/g)).toHaveLength(1)
  expect(output.match(/account add google --app/g)).toHaveLength(1)
})

test('implicit command does not attach selection fallback after exact App resolution', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const definition = completeRegistry.oauthApps.get('["google","ctxindex"]')
  if (definition === undefined) throw new Error('Google fixture App missing')
  const exit = await handleAccountCommand(
    { kind: 'add', provider: 'google' },
    commandRuntime({
      openDeps: async () =>
        openedDeps(async () => ({
          provider: definition.provider,
          label: definition.label,
          config: definition.config,
          definition,
        })),
      authorizeProvider: async (_input, deps) => {
        await expect(
          deps.resolveApp('google', 'ctxindex'),
        ).resolves.toMatchObject({ label: 'ctxindex' })
        throw new CtxindexAuthError(
          'insufficient_scope',
          'Provider denied the requested scopes',
        )
      },
    }),
  )

  expect(exit).toBe(50)
  const output = String(error.mock.calls[0]?.[0])
  expect(output).toBe('Provider denied the requested scopes')
  expect(output).not.toMatch(/oauth-app add|account add .*--app/)
})

test('implicit command rejects a changed cached App authorization request', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  const definition = completeRegistry.oauthApps.get('["google","ctxindex"]')
  if (definition === undefined) throw new Error('Google fixture App missing')
  const exit = await handleAccountCommand(
    { kind: 'add', provider: 'google' },
    commandRuntime({
      openDeps: async () =>
        openedDeps(async () => ({
          provider: definition.provider,
          label: definition.label,
          config: definition.config,
          definition,
        })),
      authorizeProvider: async (_input, deps) =>
        deps.resolveApp('microsoft', 'ctxindex') as never,
    }),
  )

  expect(exit).toBe(2)
  expect(String(error.mock.calls[0]?.[0])).toBe(
    'OAuth App selection changed during authorization',
  )
})

test('explicit App resolution failure does not add managed fallback guidance', () => {
  expect(
    formatAccountCommandError(new Error('explicit resolution failure')),
  ).toBe('explicit resolution failure')
})
