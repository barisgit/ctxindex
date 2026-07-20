import { expect, test } from 'bun:test'
import type {
  ManagedOAuthAppPolicy,
  ManagedOAuthAppResolution,
} from '@ctxindex/core/oauth-app'
import type { CompleteRegistry } from '@ctxindex/core/registry'
import {
  formatAccountCommandError,
  resolveAccountOAuthAppLabel,
} from './handle-account-command'

const registry = {} as CompleteRegistry
const policies = [] as readonly ManagedOAuthAppPolicy[]

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

test('managed authorization failure appends static BYOA commands without changing the error', () => {
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

test('explicit App failure does not add managed fallback guidance', () => {
  expect(formatAccountCommandError(new Error('explicit failure'))).toBe(
    'explicit failure',
  )
})
