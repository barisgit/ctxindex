import type {
  AdapterLogger,
  AdapterSourceContext,
  AnyAdapterDefinition,
} from '@ctxindex/extension-sdk'
import { type AuthService, isGrantCompatible } from '../auth'
import {
  CtxindexAuthError,
  CtxindexError,
  CtxindexNotFoundError,
} from '../errors'
import { assertEgressAllowed, egressFetch } from '../net'
import type { ExtensionRegistry } from '../registry'
import type { CtxindexDatabase } from '../storage'

interface SourceSqlRow {
  readonly id: string
  readonly adapter_id: string
  readonly config_json: string
  readonly grant_id: string | null
}

function sanitizeTokenResolutionError(error: unknown): CtxindexAuthError {
  if (!(error instanceof CtxindexAuthError)) {
    return new CtxindexAuthError(
      'unknown_auth_error',
      'Source Grant token resolution failed',
    )
  }
  if (
    error.code === 'needs_auth' ||
    error.code === 'invalid_grant' ||
    error.code === 'missing_oauth_app_config'
  ) {
    return needsAuth()
  }
  return new CtxindexAuthError(
    error.code,
    `Source Grant token resolution failed (${error.code})`,
  )
}

export type SourceProviderFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

interface GrantSqlRow {
  readonly provider: string
  readonly scopes_json: string
}

export interface SourceProviderContext {
  readonly adapter: AnyAdapterDefinition
  readonly source: AdapterSourceContext
  readonly fetch: typeof fetch
  readonly logger: AdapterLogger
}

export interface CreateSourceProviderContextInput {
  readonly db: CtxindexDatabase
  readonly sourceId: string
  readonly registry: ExtensionRegistry
  readonly authService: Pick<AuthService, 'resolveLinkedGrantAccessToken'>
  readonly logger: AdapterLogger
  readonly fetch?: SourceProviderFetch
  readonly retryUnauthorized?: boolean
}

const SENSITIVE_CONFIG_KEYS = new Set([
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'client_secret',
  'clientSecret',
  'authorization',
])

function withoutSensitiveConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSensitiveConfig)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      SENSITIVE_CONFIG_KEYS.has(key)
        ? []
        : [[key, withoutSensitiveConfig(entry)]],
    ),
  )
}

function needsAuth(): CtxindexAuthError {
  return new CtxindexAuthError(
    'needs_auth',
    'Source requires a linked compatible Grant',
  )
}

function parseConfig(
  adapter: AnyAdapterDefinition,
  configJson: string,
): unknown {
  let config: unknown
  try {
    config = JSON.parse(configJson)
  } catch {
    throw new CtxindexError('Source config is invalid', 'invalid_source_config')
  }
  const parsed = adapter.configSchema.safeParse(config)
  if (!parsed.success) {
    throw new CtxindexError('Source config is invalid', 'invalid_source_config')
  }
  return withoutSensitiveConfig(parsed.data)
}

export async function createSourceProviderContext(
  input: CreateSourceProviderContextInput,
): Promise<SourceProviderContext> {
  const source = input.db
    .prepare(
      `SELECT id, adapter_id, config_json, grant_id
       FROM sources WHERE id = ?`,
    )
    .get(input.sourceId) as SourceSqlRow | null
  if (!source) throw new CtxindexNotFoundError('Source not found')

  const adapter = input.registry.adapters.get({ id: source.adapter_id })
  if (!adapter) {
    throw new CtxindexError(
      'Source Adapter definition is unavailable',
      'adapter_unavailable',
    )
  }
  const config = parseConfig(adapter, source.config_json)
  const sourceContext = { id: source.id, config }
  const providerApiHosts = adapter.providerApiHosts ?? []
  const providerFetch =
    input.fetch ??
    ((url: string, init?: RequestInit) =>
      egressFetch(url, init, providerApiHosts))
  const plainFetch = (async (
    requestInput: string | URL | { readonly url: string },
    requestInit?: RequestInit,
  ) => {
    const url =
      typeof requestInput === 'string'
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput.url
    assertEgressAllowed(url, providerApiHosts)
    return providerFetch(url, { ...requestInit, redirect: 'manual' })
  }) as typeof fetch

  const providerDefinition = adapter.provider
  const auth = providerDefinition?.auth
  if (auth === undefined || auth.kind === 'none') {
    return {
      adapter,
      source: sourceContext,
      fetch: plainFetch,
      logger: input.logger,
    }
  }
  if (auth.kind !== 'oauth2' || !source.grant_id) throw needsAuth()
  if (providerDefinition === undefined) throw needsAuth()

  const grantId = source.grant_id
  const grant = input.db
    .prepare('SELECT provider, scopes_json FROM grants WHERE id = ?')
    .get(grantId) as GrantSqlRow | null
  const authorization = {
    provider: providerDefinition,
    access: adapter.access ?? { scopes: [] },
  }
  if (
    !grant ||
    !isGrantCompatible(authorization, {
      provider: grant.provider,
      scopes: grant.scopes_json,
    })
  ) {
    throw needsAuth()
  }

  const authorizedFetch = (async (
    requestInput:
      | string
      | URL
      | {
          readonly url: string
          readonly method?: string
          readonly headers?: unknown
          readonly body?: unknown
          readonly signal?: AbortSignal
        },
    requestInit?: RequestInit,
  ): Promise<Response> => {
    const request =
      typeof requestInput === 'string' || requestInput instanceof URL
        ? undefined
        : requestInput
    const url =
      typeof requestInput === 'string'
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput.url
    // Reject undeclared hosts before resolving a token or invoking any fetch.
    assertEgressAllowed(url, providerApiHosts)
    const send = async (token: string): Promise<Response> => {
      const headers = new Headers(
        (requestInit?.headers ?? request?.headers) as ConstructorParameters<
          typeof Headers
        >[0],
      )
      headers.set('authorization', `Bearer ${token}`)
      try {
        const method = requestInit?.method ?? request?.method
        const body = requestInit?.body ?? request?.body
        const signal = requestInit?.signal ?? request?.signal
        return await providerFetch(url, {
          ...requestInit,
          headers: Object.fromEntries(headers.entries()),
          ...(method ? { method } : {}),
          ...(body == null ? {} : { body: body as RequestInit['body'] }),
          ...(signal ? { signal } : {}),
          redirect: 'manual',
        })
      } catch (error) {
        if ((requestInit?.signal ?? request?.signal)?.aborted) throw error
        if (error instanceof CtxindexError) throw error
        throw new CtxindexError('Provider request failed', 'network')
      }
    }
    const resolveToken = async (forceRefresh: boolean): Promise<string> => {
      try {
        return await input.authService.resolveLinkedGrantAccessToken(
          grantId,
          forceRefresh ? { forceRefresh: true } : undefined,
        )
      } catch (error) {
        throw sanitizeTokenResolutionError(error)
      }
    }

    const response = await send(await resolveToken(false))
    if (response.status !== 401 || input.retryUnauthorized === false) {
      return response
    }
    return send(await resolveToken(true))
  }) as typeof fetch

  return {
    adapter,
    source: sourceContext,
    fetch: authorizedFetch,
    logger: input.logger,
  }
}
