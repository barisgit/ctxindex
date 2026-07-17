import { ulid } from 'ulid'
import { createAccountService, normalizeGrantScopes } from '../account'
import { readEnvironmentVariable } from '../config'
import { CtxindexAuthError, CtxindexNotFoundError } from '../errors'
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
  account_label: string
  scopes_json: string
  access_token_ref: string | null
  refresh_token_ref: string | null
  client_id_ref: string | null
  client_secret_ref: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

type ExistingGrantRefs = {
  readonly id: string
  readonly client_id_ref: string | null
  readonly client_secret_ref: string | null
  readonly access_token_ref: string | null
  readonly refresh_token_ref: string | null
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
      const existing = deps.db
        .prepare(
          `SELECT g.id, g.client_id_ref, g.client_secret_ref,
                  g.access_token_ref, g.refresh_token_ref
             FROM grants AS g
             JOIN accounts AS a ON a.id = g.account_id
            WHERE a.provider = ? AND a.external_user_id = ?
            LIMIT 1`,
        )
        .get(
          input.provider,
          input.account.externalUserId,
        ) as ExistingGrantRefs | null
      const grantId = existing?.id ?? ulid(timestamp)
      const refs: string[] = []
      let result: AddGrantResult
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
        result = deps.db.transaction(() => {
          const { accountId } = accountService.upsertAccount({
            provider: input.provider,
            ...input.account,
          })
          if (existing) {
            const updated = deps.db
              .prepare(
                `UPDATE grants
                    SET scopes_json = ?, client_id_ref = ?, client_secret_ref = ?,
                        access_token_ref = ?, refresh_token_ref = ?, expires_at = ?,
                        updated_at = ?
                  WHERE id = ? AND account_id = ?`,
              )
              .run(
                JSON.stringify(scopes),
                clientIdRef,
                clientSecretRef,
                accessTokenRef,
                refreshTokenRef,
                input.expiresAt ?? null,
                timestamp,
                grantId,
                accountId,
              )
            if (updated.changes !== 1) throw new Error('Grant upsert failed')
          } else {
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
          }
          return { grantId, accountId }
        })()
      } catch (cause) {
        await cleanup(deps.store, refs)
        throw cause
      }
      if (existing) {
        await cleanup(
          deps.store,
          [
            existing.client_id_ref,
            existing.client_secret_ref,
            existing.access_token_ref,
            existing.refresh_token_ref,
          ].filter((ref): ref is string => ref !== null),
        )
      }
      deps.logger.debug(
        {
          grantId: result.grantId,
          accountId: result.accountId,
          provider: input.provider,
        },
        existing ? 'OAuth Grant updated' : 'OAuth Grant added',
      )
      return result
    },
    async removeAccount(label: string): Promise<void> {
      const account = deps.db
        .prepare('SELECT id FROM accounts WHERE label = ?')
        .get(label) as { readonly id: string } | null
      if (!account) {
        throw new CtxindexNotFoundError(`account not found: "${label}"`)
      }
      const grants = deps.db
        .prepare(
          'SELECT client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref FROM grants WHERE account_id = ?',
        )
        .all(account.id) as Omit<ExistingGrantRefs, 'id'>[]
      const timestamp = now()
      deps.db.transaction(() => {
        deps.db
          .prepare(
            `INSERT INTO source_sync_state (source_id, last_status, updated_at)
             SELECT id, 'needs_auth', ? FROM sources
              WHERE grant_id IN (SELECT id FROM grants WHERE account_id = ?)
             ON CONFLICT(source_id) DO UPDATE
               SET last_status = 'needs_auth', updated_at = excluded.updated_at`,
          )
          .run(timestamp, account.id)
        deps.db
          .prepare(
            'UPDATE sources SET grant_id = NULL, updated_at = ? WHERE grant_id IN (SELECT id FROM grants WHERE account_id = ?)',
          )
          .run(timestamp, account.id)
        deps.db
          .prepare('DELETE FROM grants WHERE account_id = ?')
          .run(account.id)
        deps.db.prepare('DELETE FROM accounts WHERE id = ?').run(account.id)
      })()
      await cleanup(
        deps.store,
        grants.flatMap((grant) =>
          [
            grant.client_id_ref,
            grant.client_secret_ref,
            grant.access_token_ref,
            grant.refresh_token_ref,
          ].filter((ref): ref is string => ref !== null),
        ),
      )
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
      if (!grant.clientIdRef)
        throw new CtxindexAuthError(
          'missing_oauth_client_creds',
          'OAuth client id is unavailable',
        )
      const clientId = await deps.store.getSecret(grant.clientIdRef)
      const clientSecret = grant.clientSecretRef
        ? await deps.store.getSecret(grant.clientSecretRef)
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
