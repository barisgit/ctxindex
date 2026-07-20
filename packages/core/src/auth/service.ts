import type { OAuthProviderDefinition } from '@ctxindex/extension-sdk'
import { ulid } from 'ulid'
import { createAccountService, normalizeGrantScopes } from '../account'
import { readEnvironmentVariable } from '../config'
import { CtxindexAuthError, CtxindexNotFoundError } from '../errors'
import {
  normalizeOAuthScopes,
  postOAuthToken,
  resolveOAuthAppCredentials,
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
  app_config_ref: string
  expires_at: number | null
  created_at: number
  updated_at: number
}

type ExistingGrantRefs = {
  readonly id: string
  readonly app_config_ref: string
  readonly access_token_ref: string | null
  readonly refresh_token_ref: string | null
}

const accountMutationTails = new Map<string, Promise<void>>()

function accountMutationKey(provider: string, externalUserId: string): string {
  return JSON.stringify([provider, externalUserId])
}

async function withAccountMutation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const prior = accountMutationTails.get(key) ?? Promise.resolve()
  let release = () => {}
  const tail = new Promise<void>((resolve) => {
    release = resolve
  })
  accountMutationTails.set(key, tail)
  await prior
  try {
    return await operation()
  } finally {
    release()
    if (accountMutationTails.get(key) === tail) accountMutationTails.delete(key)
  }
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
    appConfigRef: row.app_config_ref,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

type CleanupLifecycle =
  | 'authorization-rollback'
  | 'reauthorization'
  | 'account-removal'
  | 'refresh'
  | 'refresh-rollback'

async function cleanup(
  store: AuthDependencies['store'],
  refs: readonly string[],
): Promise<number> {
  let failures = 0
  for (const ref of refs) {
    try {
      await store.deleteSecret(ref)
    } catch {
      failures += 1
    }
  }
  return failures
}

function warnCleanupPending(
  logger: AuthDependencies['logger'],
  context: {
    readonly lifecycle: CleanupLifecycle
    readonly provider: string
    readonly grantId: string
  },
  cleanupFailures: number,
): void {
  if (cleanupFailures === 0) return
  logger.warn(
    { ...context, cleanupFailures },
    'OAuth secret cleanup remains pending',
  )
}

export function createAuthService(deps: AuthDependencies): AuthService {
  const now = deps.now ?? Date.now
  const readEnvironment = deps.readEnvironment ?? readEnvironmentVariable
  const accountService = createAccountService({ db: deps.db, now })
  const getGrantById = async (grantId: string): Promise<GrantRow | null> => {
    const row = deps.db
      .prepare(
        'SELECT g.id, g.account_id, g.provider, a.label AS account_label, g.scopes_json, g.access_token_ref, g.refresh_token_ref, g.app_config_ref, g.expires_at, g.created_at, g.updated_at FROM grants AS g JOIN accounts AS a ON a.id = g.account_id WHERE g.id = ? LIMIT 1',
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
      const provider = deps.registry.providers.get(input.provider)
      if (!provider || provider.auth.kind !== 'oauth2')
        throw new CtxindexAuthError(
          'needs_auth',
          'OAuth provider is not loaded',
        )
      const oauthProvider = provider as OAuthProviderDefinition
      if (!input.refreshToken)
        throw new CtxindexAuthError(
          'invalid_grant',
          'A durable refresh token is required',
        )
      const appConfig = oauthProvider.auth.registration.configSchema.safeParse(
        input.appConfig,
      )
      if (!appConfig.success)
        throw new CtxindexAuthError(
          'missing_oauth_app_config',
          'OAuth App configuration is invalid',
        )
      resolveOAuthAppCredentials(input.appConfig)
      return withAccountMutation(
        accountMutationKey(input.provider, input.account.externalUserId),
        async () => {
          const timestamp = now()
          const existing = deps.db
            .prepare(
              `SELECT g.id, g.app_config_ref,
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
            const appConfigRef = await write(
              input.provider,
              grantId,
              'app-config',
              JSON.stringify(appConfig.data),
            )
            refs.push(appConfigRef)
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
                    SET scopes_json = ?, app_config_ref = ?,
                        access_token_ref = ?, refresh_token_ref = ?, expires_at = ?,
                        updated_at = ?
                  WHERE id = ? AND account_id = ?`,
                  )
                  .run(
                    JSON.stringify(scopes),
                    appConfigRef,
                    accessTokenRef,
                    refreshTokenRef,
                    input.expiresAt ?? null,
                    timestamp,
                    grantId,
                    accountId,
                  )
                if (updated.changes !== 1)
                  throw new Error('Grant upsert failed')
              } else {
                deps.db
                  .prepare(
                    'INSERT INTO grants (id, account_id, provider, scopes_json, app_config_ref, access_token_ref, refresh_token_ref, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  )
                  .run(
                    grantId,
                    accountId,
                    input.provider,
                    JSON.stringify(scopes),
                    appConfigRef,
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
            warnCleanupPending(
              deps.logger,
              {
                lifecycle: 'authorization-rollback',
                provider: input.provider,
                grantId,
              },
              await cleanup(deps.store, refs),
            )
            throw cause
          }
          if (existing) {
            warnCleanupPending(
              deps.logger,
              {
                lifecycle: 'reauthorization',
                provider: input.provider,
                grantId,
              },
              await cleanup(
                deps.store,
                [
                  existing.app_config_ref,
                  existing.access_token_ref,
                  existing.refresh_token_ref,
                ].filter((ref): ref is string => ref !== null),
              ),
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
      )
    },
    async removeAccount(label: string): Promise<void> {
      const account = deps.db
        .prepare(
          'SELECT id, provider, external_user_id FROM accounts WHERE label = ?',
        )
        .get(label) as {
        readonly id: string
        readonly provider: string
        readonly external_user_id: string
      } | null
      if (!account) {
        throw new CtxindexNotFoundError(`account not found: "${label}"`)
      }
      return withAccountMutation(
        accountMutationKey(account.provider, account.external_user_id),
        async () => {
          const currentAccount = deps.db
            .prepare('SELECT id FROM accounts WHERE id = ? AND label = ?')
            .get(account.id, label) as { readonly id: string } | null
          if (!currentAccount) {
            throw new CtxindexNotFoundError(`account not found: "${label}"`)
          }
          const grants = deps.db
            .prepare(
              'SELECT id, provider, app_config_ref, access_token_ref, refresh_token_ref FROM grants WHERE account_id = ?',
            )
            .all(account.id) as (ExistingGrantRefs & {
            readonly provider: string
          })[]
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
          const cleanupFailures = await cleanup(
            deps.store,
            grants.flatMap((grant) =>
              [
                grant.app_config_ref,
                grant.access_token_ref,
                grant.refresh_token_ref,
              ].filter((ref): ref is string => ref !== null),
            ),
          )
          const firstGrant = grants[0]
          if (firstGrant)
            warnCleanupPending(
              deps.logger,
              {
                lifecycle: 'account-removal',
                provider: firstGrant.provider,
                grantId: firstGrant.id,
              },
              cleanupFailures,
            )
        },
      )
    },
    getGrantById,
    async listGrants(provider?: string): Promise<readonly GrantRow[]> {
      const sql =
        'SELECT g.id, g.account_id, g.provider, a.label AS account_label, g.scopes_json, g.access_token_ref, g.refresh_token_ref, g.app_config_ref, g.expires_at, g.created_at, g.updated_at FROM grants AS g JOIN accounts AS a ON a.id = g.account_id'
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
      const selectedGrant = await getGrantById(grantId)
      if (!selectedGrant?.refreshTokenRef)
        throw new CtxindexAuthError(
          'invalid_grant',
          'Grant cannot be refreshed',
        )
      const account = deps.db
        .prepare('SELECT external_user_id FROM accounts WHERE id = ?')
        .get(selectedGrant.accountId) as {
        readonly external_user_id: string
      } | null
      if (!account)
        throw new CtxindexAuthError(
          'invalid_grant',
          'Grant cannot be refreshed',
        )
      return withAccountMutation(
        accountMutationKey(selectedGrant.provider, account.external_user_id),
        async () => {
          const grant = await getGrantById(grantId)
          if (!grant?.refreshTokenRef)
            throw new CtxindexAuthError(
              'invalid_grant',
              'Grant cannot be refreshed',
            )
          const provider = deps.registry.providers.get(grant.provider)
          if (!provider || provider.auth.kind !== 'oauth2') {
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
          const oauthProvider = provider as OAuthProviderDefinition
          let appConfig: unknown
          try {
            appConfig = JSON.parse(
              await deps.store.getSecret(grant.appConfigRef),
            )
          } catch (cause) {
            throw new CtxindexAuthError(
              'missing_oauth_app_config',
              'Grant OAuth App snapshot is unavailable',
              { cause },
            )
          }
          const parsedConfig =
            oauthProvider.auth.registration.configSchema.safeParse(appConfig)
          if (!parsedConfig.success)
            throw new CtxindexAuthError(
              'missing_oauth_app_config',
              'Grant OAuth App snapshot is invalid',
            )
          const { clientId, clientSecret } = resolveOAuthAppCredentials(
            parsedConfig.data as Readonly<Record<string, unknown>>,
          )
          const refreshToken = await deps.store.getSecret(grant.refreshTokenRef)
          const token = await postOAuthToken({
            provider: oauthProvider,
            endpoint: resolveOAuthEndpoint(
              oauthProvider,
              'token',
              readEnvironment,
            ),
            clientId,
            ...(clientSecret ? { clientSecret } : {}),
            grant: { kind: 'refresh_token', refreshToken },
          })
          const scopes = resolveRefreshGrantedScopes(
            token.scope,
            grant.scopes,
            oauthProvider,
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
            warnCleanupPending(
              deps.logger,
              {
                lifecycle: 'refresh',
                provider: grant.provider,
                grantId,
              },
              await cleanup(deps.store, oldRefs),
            )
            deps.logger.debug(
              { grantId, provider: grant.provider },
              'OAuth access token refreshed',
            )
            return token.accessToken
          } catch (cause) {
            warnCleanupPending(
              deps.logger,
              {
                lifecycle: 'refresh-rollback',
                provider: grant.provider,
                grantId,
              },
              await cleanup(deps.store, freshRefs),
            )
            throw cause
          }
        },
      )
    },
  }
  return service
}
