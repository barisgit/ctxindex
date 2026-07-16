import { ulid } from 'ulid'
import { createAccountService, normalizeGrantScopes } from '../account'
import { readEnvironmentVariable } from '../config'
import { CtxindexAuthError } from '../errors'
import {
  normalizeOAuthScopes,
  postOAuthToken,
  resolveOAuthEndpoint,
  resolveRefreshGrantedScopes,
} from './oauth'
import type {
  AddGrantInput,
  AddGrantResult,
  AuthDependencies,
  AuthService,
  GrantRow,
} from './types'

type GrantSqlRow = {
  id: string
  account_id: string
  provider: string
  account_label: string | null
  scopes_json: string
  access_token_ref: string | null
  refresh_token_ref: string | null
  client_id_ref: string | null
  client_secret_ref: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

function toGrantRow(row: GrantSqlRow): GrantRow {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: row.provider,
    accountLabel: row.account_label,
    scopes: normalizeGrantScopes(row.scopes_json),
    accessTokenRef: row.access_token_ref,
    refreshTokenRef: row.refresh_token_ref,
    clientIdRef: row.client_id_ref,
    clientSecretRef: row.client_secret_ref,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function cleanup(
  store: AuthDependencies['store'],
  refs: readonly string[],
): Promise<void> {
  for (const ref of refs) {
    try {
      await store.deleteSecret(ref)
    } catch {}
  }
}

export function createAuthService(deps: AuthDependencies): AuthService {
  const now = deps.now ?? Date.now
  const readEnvironment = deps.readEnvironment ?? readEnvironmentVariable
  const accountService = createAccountService({ db: deps.db, now })
  const getGrantById = async (grantId: string): Promise<GrantRow | null> => {
    const row = deps.db
      .prepare(
        'SELECT g.id, g.account_id, g.provider, a.label AS account_label, g.scopes_json, g.access_token_ref, g.refresh_token_ref, g.client_id_ref, g.client_secret_ref, g.expires_at, g.created_at, g.updated_at FROM grants AS g JOIN accounts AS a ON a.id = g.account_id WHERE g.id = ? LIMIT 1',
      )
      .get(grantId) as GrantSqlRow | null
    return row ? toGrantRow(row) : null
  }
  const write = async (
    provider: string,
    grantId: string,
    kind: string,
    value: string,
  ): Promise<string> =>
    deps.store.setSecret(provider, `grant:${grantId}:${kind}:${ulid()}`, value)

  const service: AuthService = {
    async addGrant(input: AddGrantInput): Promise<AddGrantResult> {
      const provider = deps.registry.getOAuthProvider(input.provider)
      if (!provider)
        throw new CtxindexAuthError(
          'needs_auth',
          'OAuth provider is not loaded',
        )
      if (!input.refreshToken)
        throw new CtxindexAuthError(
          'invalid_grant',
          'A durable refresh token is required',
        )
      if (provider.client.secret === 'required' && !input.clientSecret)
        throw new CtxindexAuthError(
          'missing_oauth_client_creds',
          'OAuth provider requires a client secret',
        )
      const timestamp = now()
      const grantId = ulid(timestamp)
      const refs: string[] = []
      try {
        const clientIdRef = await write(
          input.provider,
          grantId,
          'client-id',
          input.clientId,
        )
        refs.push(clientIdRef)
        let clientSecretRef: string | null = null
        if (input.clientSecret !== undefined) {
          clientSecretRef = await write(
            input.provider,
            grantId,
            'client-secret',
            input.clientSecret,
          )
          refs.push(clientSecretRef)
        }
        const refreshTokenRef = await write(
          input.provider,
          grantId,
          'refresh-token',
          input.refreshToken,
        )
        refs.push(refreshTokenRef)
        let accessTokenRef: string | null = null
        if (input.accessToken !== undefined) {
          accessTokenRef = await write(
            input.provider,
            grantId,
            'access-token',
            input.accessToken,
          )
          refs.push(accessTokenRef)
        }
        const scopes = normalizeOAuthScopes(input.scopes)
        const result = deps.db.transaction(() => {
          const { accountId } = accountService.upsertAccount({
            provider: input.provider,
            ...input.account,
          })
          deps.db
            .prepare(
              'INSERT INTO grants (id, account_id, provider, scopes_json, client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(
              grantId,
              accountId,
              input.provider,
              JSON.stringify(scopes),
              clientIdRef,
              clientSecretRef,
              accessTokenRef,
              refreshTokenRef,
              input.expiresAt ?? null,
              timestamp,
              timestamp,
            )
          return { grantId, accountId }
        })()
        deps.logger.debug(
          {
            grantId: result.grantId,
            accountId: result.accountId,
            provider: input.provider,
          },
          'OAuth Grant added',
        )
        return result
      } catch (cause) {
        await cleanup(deps.store, refs)
        throw cause
      }
    },
    getGrantById,
    async listGrants(provider?: string): Promise<readonly GrantRow[]> {
      const sql =
        'SELECT g.id, g.account_id, g.provider, a.label AS account_label, g.scopes_json, g.access_token_ref, g.refresh_token_ref, g.client_id_ref, g.client_secret_ref, g.expires_at, g.created_at, g.updated_at FROM grants AS g JOIN accounts AS a ON a.id = g.account_id'
      const rows = (
        provider === undefined
          ? deps.db.prepare(`${sql} ORDER BY g.provider, g.id`).all()
          : deps.db
              .prepare(`${sql} WHERE g.provider = ? ORDER BY g.id`)
              .all(provider)
      ) as GrantSqlRow[]
      return rows.map(toGrantRow)
    },
    async resolveLinkedGrantAccessToken(grantId, options = {}) {
      const grant = await getGrantById(grantId)
      if (!grant)
        throw new CtxindexAuthError(
          'invalid_grant',
          'linked Grant is unavailable',
        )
      if (
        !options.forceRefresh &&
        grant.accessTokenRef &&
        grant.expiresAt !== null &&
        grant.expiresAt > now()
      )
        return deps.store.getSecret(grant.accessTokenRef)
      return service.refreshAccessToken(grantId)
    },
    async refreshAccessToken(grantId: string): Promise<string> {
      const grant = await getGrantById(grantId)
      if (!grant?.refreshTokenRef)
        throw new CtxindexAuthError(
          'invalid_grant',
          'Grant cannot be refreshed',
        )
      const provider = deps.registry.getOAuthProvider(grant.provider)
      if (!provider) {
        deps.db
          .prepare(
            "UPDATE source_sync_state SET last_status = 'needs_auth', updated_at = ? WHERE source_id IN (SELECT id FROM sources WHERE grant_id = ?)",
          )
          .run(now(), grantId)
        throw new CtxindexAuthError(
          'needs_auth',
          'Grant provider is not loaded',
        )
      }
      const clientId = grant.clientIdRef
        ? await deps.store.getSecret(grant.clientIdRef)
        : readEnvironment(provider.environment.clientId)
      if (!clientId)
        throw new CtxindexAuthError(
          'missing_oauth_client_creds',
          'OAuth client id is unavailable',
        )
      const clientSecret = grant.clientSecretRef
        ? await deps.store.getSecret(grant.clientSecretRef)
        : provider.environment.clientSecret
          ? readEnvironment(provider.environment.clientSecret)
          : undefined
      if (provider.client.secret === 'required' && !clientSecret)
        throw new CtxindexAuthError(
          'missing_oauth_client_creds',
          'OAuth client secret is unavailable',
        )
      const refreshToken = await deps.store.getSecret(grant.refreshTokenRef)
      const token = await postOAuthToken({
        provider,
        endpoint: resolveOAuthEndpoint(provider, 'token', readEnvironment),
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
        grant: { kind: 'refresh_token', refreshToken },
      })
      const scopes = resolveRefreshGrantedScopes(
        token.scope,
        grant.scopes,
        provider,
      )
      const freshRefs: string[] = []
      try {
        const accessTokenRef = await write(
          grant.provider,
          grantId,
          'access-token',
          token.accessToken,
        )
        freshRefs.push(accessTokenRef)
        let refreshTokenRef = grant.refreshTokenRef
        if (token.refreshToken !== undefined) {
          refreshTokenRef = await write(
            grant.provider,
            grantId,
            'refresh-token',
            token.refreshToken,
          )
          freshRefs.push(refreshTokenRef)
        }
        const updated = deps.db
          .prepare(
            'UPDATE grants SET access_token_ref = ?, refresh_token_ref = ?, scopes_json = ?, expires_at = ?, updated_at = ? WHERE id = ?',
          )
          .run(
            accessTokenRef,
            refreshTokenRef,
            JSON.stringify(scopes),
            now() + token.expiresIn * 1000,
            now(),
            grantId,
          )
        if (updated.changes !== 1)
          throw new CtxindexAuthError(
            'invalid_grant',
            'Grant disappeared during refresh',
          )
        const oldRefs = [
          grant.accessTokenRef,
          token.refreshToken !== undefined ? grant.refreshTokenRef : null,
        ].filter((ref): ref is string => ref !== null)
        await cleanup(deps.store, oldRefs)
        deps.logger.debug(
          { grantId, provider: grant.provider },
          'OAuth access token refreshed',
        )
        return token.accessToken
      } catch (cause) {
        await cleanup(deps.store, freshRefs)
        throw cause
      }
    },
  }
  return service
}
