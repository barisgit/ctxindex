import { ulid } from 'ulid'
import { CtxindexAuthError } from '../errors'
import { parseSecretRef } from '../secrets'
import { GOOGLE_TOKEN_ENDPOINT, postOAuthTokenRequest } from './google-client'
import type {
  AddGoogleGrantInput,
  AddGoogleGrantResult,
  AuthDependencies,
  AuthService,
  ExchangeAuthCodeInput,
  GoogleGrantRow,
  GoogleGrantSummary,
  GoogleTokenResponse,
  OAuthClientCreds,
} from './types'

type GrantSqlRow = {
  id: string
  account_id: string
  provider: string
  scopes: string
  access_token_ref: string | null
  refresh_token_ref: string | null
  client_id_ref: string | null
  client_secret_ref: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
}

function toGoogleGrantRow(row: GrantSqlRow): GoogleGrantRow {
  return {
    id: row.id,
    accountId: row.account_id,
    provider: 'google',
    scopes: row.scopes,
    accessTokenRef: row.access_token_ref,
    refreshTokenRef: row.refresh_token_ref,
    clientIdRef: row.client_id_ref,
    clientSecretRef: row.client_secret_ref,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function writeSecret(
  deps: AuthDependencies,
  key: string,
  value: string,
): Promise<string> {
  return deps.store.setSecret('google', key, value)
}

async function overwriteSecret(
  deps: AuthDependencies,
  ref: string,
  fallbackKey: string,
  value: string,
): Promise<string> {
  const parsed = parseSecretRef(ref)
  if (parsed.backend === 'keychain') {
    return deps.store.setSecret(parsed.scope, parsed.key, value)
  }
  return deps.store.setSecret('google', parsed.key || fallbackKey, value)
}

async function resolveOAuthClientCreds(
  deps: AuthDependencies,
  grant: GoogleGrantRow,
): Promise<OAuthClientCreds> {
  const envClientId = deps.env.CTXINDEX_GMAIL_CLIENT_ID
  const envClientSecret = deps.env.CTXINDEX_GMAIL_CLIENT_SECRET
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret }
  }

  if (grant.clientIdRef && grant.clientSecretRef) {
    return {
      clientId: await deps.store.getSecret(grant.clientIdRef),
      clientSecret: await deps.store.getSecret(grant.clientSecretRef),
    }
  }

  throw new CtxindexAuthError(
    'missing_oauth_client_creds',
    `no client_id/secret available for grant ${grant.id}`,
  )
}

export function createAuthService(deps: AuthDependencies): AuthService {
  return {
    async addGoogleGrant(
      input: AddGoogleGrantInput,
    ): Promise<AddGoogleGrantResult> {
      const now = Date.now()
      const accountId = ulid()
      const grantId = ulid()

      const refreshTokenRef = await writeSecret(
        deps,
        `refresh_token:${grantId}`,
        input.refreshToken,
      )
      const accessTokenRef = input.accessToken
        ? await writeSecret(deps, `access_token:${grantId}`, input.accessToken)
        : null
      const clientIdRef = await writeSecret(
        deps,
        `client_id:${grantId}`,
        input.clientId,
      )
      const clientSecretRef = await writeSecret(
        deps,
        `client_secret:${grantId}`,
        input.clientSecret,
      )

      const insertRows = deps.db.transaction(() => {
        deps.db
          .prepare(
            `INSERT INTO accounts
               (id, provider, label, external_user_id, created_at, updated_at)
             VALUES (?, 'google', ?, ?, ?, ?)`,
          )
          .run(
            accountId,
            input.accountEmail ?? 'google',
            input.accountEmail ?? null,
            now,
            now,
          )

        deps.db
          .prepare(
            `INSERT INTO grants
               (id, account_id, provider, scopes_json, client_id_ref, client_secret_ref, access_token_ref, refresh_token_ref, expires_at, created_at, updated_at)
             VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            grantId,
            accountId,
            input.scopes,
            clientIdRef,
            clientSecretRef,
            accessTokenRef,
            refreshTokenRef,
            input.expiresAt ?? null,
            now,
            now,
          )
      })
      insertRows()
      deps.logger.debug({ grantId, accountId }, 'google auth grant added')

      return { grantId, accountId }
    },

    async getGoogleGrantById(grantId: string): Promise<GoogleGrantRow | null> {
      const row = deps.db
        .prepare(
          `SELECT id, account_id, provider, scopes_json AS scopes, access_token_ref, refresh_token_ref, client_id_ref, client_secret_ref, expires_at, created_at, updated_at
           FROM grants WHERE id = ? AND provider = 'google' LIMIT 1`,
        )
        .get(grantId) as GrantSqlRow | null
      return row ? toGoogleGrantRow(row) : null
    },

    async listGoogleGrants(): Promise<GoogleGrantSummary[]> {
      const rows = deps.db
        .prepare(
          `SELECT g.id, g.provider, g.scopes_json AS scopes, g.expires_at, a.external_user_id AS account_email, a.label AS account_display_name
           FROM grants AS g
           LEFT JOIN accounts AS a ON a.id = g.account_id
           WHERE g.provider = 'google'
           ORDER BY g.updated_at DESC, g.created_at DESC`,
        )
        .all() as {
        id: string
        provider: 'google'
        scopes: string
        expires_at: number | null
        account_email: string | null
        account_display_name: string | null
      }[]

      return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        scopes: row.scopes,
        expiresAt: row.expires_at,
        accountEmail: row.account_email,
        accountDisplayName: row.account_display_name,
      }))
    },

    async resolveLinkedGrantAccessToken(
      grantId: string,
      options = {},
    ): Promise<string> {
      const grant = await this.getGoogleGrantById(grantId)
      if (!grant) {
        throw new CtxindexAuthError(
          'invalid_grant',
          'linked Grant is unavailable',
        )
      }
      if (
        !options.forceRefresh &&
        grant.accessTokenRef &&
        grant.expiresAt !== null &&
        grant.expiresAt > Date.now()
      ) {
        return deps.store.getSecret(grant.accessTokenRef)
      }
      return this.refreshGoogleAccessToken(grantId)
    },

    async refreshGoogleAccessToken(grantId: string): Promise<string> {
      const row = deps.db
        .prepare(
          `SELECT id, account_id, provider, scopes_json AS scopes, access_token_ref, refresh_token_ref, client_id_ref, client_secret_ref, expires_at, created_at, updated_at
           FROM grants
           WHERE id = ? AND provider = 'google'
           LIMIT 1`,
        )
        .get(grantId) as GrantSqlRow | null
      if (!row) {
        throw new CtxindexAuthError(
          'invalid_grant',
          `google grant not found: ${grantId}`,
        )
      }

      const grant = toGoogleGrantRow(row)
      if (!grant.refreshTokenRef) {
        throw new CtxindexAuthError(
          'invalid_grant',
          `no refresh token available for grant ${grantId}`,
        )
      }

      const refreshToken = await deps.store.getSecret(grant.refreshTokenRef)
      const client = await resolveOAuthClientCreds(deps, grant)
      const token = await postOAuthTokenRequest(
        new URLSearchParams({
          client_id: client.clientId,
          client_secret: client.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      )

      const accessTokenRef = grant.accessTokenRef
        ? await overwriteSecret(
            deps,
            grant.accessTokenRef,
            `access_token:${grantId}`,
            token.access_token,
          )
        : await writeSecret(deps, `access_token:${grantId}`, token.access_token)
      const expiresAt = Date.now() + token.expires_in * 1000
      deps.db
        .prepare(
          `UPDATE grants
           SET access_token_ref = ?, expires_at = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(accessTokenRef, expiresAt, Date.now(), grantId)
      deps.logger.debug({ grantId }, 'google access token refreshed')

      return token.access_token
    },

    async exchangeGoogleAuthCode(
      input: ExchangeAuthCodeInput,
    ): Promise<GoogleTokenResponse> {
      return postOAuthTokenRequest(
        new URLSearchParams({
          client_id: input.clientId,
          client_secret: input.clientSecret,
          code: input.code,
          grant_type: 'authorization_code',
          redirect_uri: input.redirectUri,
        }),
      )
    },
  }
}

export { GOOGLE_TOKEN_ENDPOINT }
