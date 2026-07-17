import { expect, test } from 'bun:test'
import { gmailAdapterDefinition } from '@ctxindex/adapters'
import type { AuthService, GrantRow } from '@ctxindex/core/auth'
import { resolveSourceGrant } from './resolve-source-grant'

const gmailAuth = gmailAdapterDefinition.auth
const requiredScopes =
  gmailAuth.kind === 'oauth2' ? gmailAuth.scopes : ([] as const)

function grant(
  id: string,
  accountId: string,
  scopes: readonly string[] = requiredScopes,
  accountLabel = accountId,
): GrantRow {
  return {
    id,
    accountId,
    provider: 'google',
    accountLabel,
    scopes,
    accessTokenRef: null,
    refreshTokenRef: null,
    clientIdRef: null,
    clientSecretRef: null,
    expiresAt: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

function service(rows: readonly GrantRow[]): AuthService {
  return {
    listGrants: async (provider?: string) =>
      rows.filter((row) => provider === undefined || row.provider === provider),
  } as unknown as AuthService
}

test('resolves one provider-compatible Grant without provider heuristics', async () => {
  await expect(
    resolveSourceGrant(service([grant('grant-1', 'account-1')]), gmailAuth),
  ).resolves.toBe('grant-1')
})

test('requires an Account or Grant id when several compatible Grants exist', async () => {
  const auth = service([
    grant('grant-1', 'account-1'),
    grant('grant-2', 'account-2'),
  ])
  await expect(resolveSourceGrant(auth, gmailAuth)).rejects.toMatchObject({
    code: 'invalid_filter',
  })
  await expect(resolveSourceGrant(auth, gmailAuth, 'account-2')).resolves.toBe(
    'grant-2',
  )
  await expect(resolveSourceGrant(auth, gmailAuth, 'grant-1')).resolves.toBe(
    'grant-1',
  )
})

test('never selects by hidden external provider identity or insufficient scopes', async () => {
  const row = grant('grant-1', 'account-1', [requiredScopes[0] ?? 'missing'])
  await expect(
    resolveSourceGrant(service([row]), gmailAuth, 'external-account-1'),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
  await expect(
    resolveSourceGrant(service([row]), gmailAuth, row.accountId),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
})

test('resolves Account labels before account and Grant ids', async () => {
  const auth = service([
    grant('grant-1', 'account-1', requiredScopes, 'work'),
    grant('work', 'account-2', requiredScopes, 'other'),
  ])
  await expect(resolveSourceGrant(auth, gmailAuth, 'work')).resolves.toBe(
    'grant-1',
  )
})
