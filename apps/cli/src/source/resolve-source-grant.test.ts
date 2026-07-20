import { expect, test } from 'bun:test'
import {
  gmailAdapterDefinition,
  localDirectoryAdapterDefinition,
} from '@ctxindex/adapters'
import type { AuthService, GrantRow } from '@ctxindex/core/auth'
import { resolveSourceGrant } from './resolve-source-grant'

const requiredScopes = gmailAdapterDefinition.access?.scopes ?? []

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
    appConfigRef: 'keychain:fixture-app-config',
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
    resolveSourceGrant(
      service([grant('grant-1', 'account-1')]),
      gmailAdapterDefinition,
    ),
  ).resolves.toBe('grant-1')
})

test('requires an Account label or id when several compatible authorizations exist', async () => {
  const auth = service([
    grant('grant-1', 'account-1'),
    grant('grant-2', 'account-2'),
  ])
  await expect(
    resolveSourceGrant(auth, gmailAdapterDefinition),
  ).rejects.toMatchObject({
    code: 'invalid_filter',
  })
  await expect(
    resolveSourceGrant(auth, gmailAdapterDefinition, 'account-2'),
  ).resolves.toBe('grant-2')
  await expect(
    resolveSourceGrant(auth, gmailAdapterDefinition, 'grant-1'),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
})

test('directs missing authorization through explicit OAuth App selection', async () => {
  await expect(
    resolveSourceGrant(service([]), gmailAdapterDefinition),
  ).rejects.toThrow(
    'no compatible Account authorization available; run bun cli account add google --app <label>',
  )
})

test('never selects by hidden external provider identity or insufficient scopes', async () => {
  const row = grant('grant-1', 'account-1', [requiredScopes[0] ?? 'missing'])
  await expect(
    resolveSourceGrant(
      service([row]),
      gmailAdapterDefinition,
      'external-account-1',
    ),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
  await expect(
    resolveSourceGrant(service([row]), gmailAdapterDefinition, row.accountId),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
})

test('resolves Account labels before Account ids without accepting Grant ids', async () => {
  const auth = service([
    grant('grant-1', 'account-1', requiredScopes, 'work'),
    grant('work', 'account-2', requiredScopes, 'other'),
  ])
  await expect(
    resolveSourceGrant(auth, gmailAdapterDefinition, 'work'),
  ).resolves.toBe('grant-1')
})

test('providerless Adapters require no Grant and reject Account selection', async () => {
  await expect(
    resolveSourceGrant(service([]), localDirectoryAdapterDefinition),
  ).resolves.toBeUndefined()
  await expect(
    resolveSourceGrant(service([]), localDirectoryAdapterDefinition, 'work'),
  ).rejects.toMatchObject({ code: 'invalid_filter' })
})
