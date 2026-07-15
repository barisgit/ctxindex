import { getGoogleAccountEmail, providerKeyForAuth } from '@ctxindex/core/auth'
import { getEnv } from '@ctxindex/core/config'
import type { ExtensionRegistry } from '@ctxindex/core/registry'
import { type AuthArgs, authUsage, parseAuthArgs } from '../args/auth'
import { obtainGoogleTokens, resolveAddCreds } from '../auth/add-google'
import { openDeps } from '../deps'
import { formatGrantAdded, formatGrants } from '../format/auth'
import { mapErrorToExit } from '../format/exit'

type AddArgs = Extract<AuthArgs, { kind: 'add' }>

export function googleOAuthScopes(
  registry: ExtensionRegistry,
): readonly string[] {
  const googleAdapters = registry.adapters
    .list()
    .filter(
      (adapter) =>
        adapter.auth.kind === 'oauth2' &&
        providerKeyForAuth(adapter.auth) === 'google',
    )
  if (googleAdapters.length === 0) {
    throw Object.assign(new Error('no Google OAuth Adapter is loaded'), {
      exitCode: 2,
    })
  }
  return [
    ...new Set(
      googleAdapters.flatMap((adapter) =>
        adapter.auth.kind === 'oauth2' ? adapter.auth.scopes : [],
      ),
    ),
  ].sort()
}

async function detectGoogleAccountEmail(token: {
  readonly refresh_token: string
  readonly access_token?: string
}): Promise<string | undefined> {
  if (!token.access_token) return undefined
  const env = getEnv()
  if (
    env.CTXINDEX_GMAIL_TOKEN_URL &&
    !env.CTXINDEX_GMAIL_MOCK_BASE_URL &&
    process.env.NODE_ENV !== 'production'
  ) {
    return undefined
  }
  try {
    return (await getGoogleAccountEmail(token.access_token)) ?? undefined
  } catch {
    return undefined
  }
}

async function handleAdd(p: AddArgs): Promise<number> {
  if (p.provider !== 'google')
    throw Object.assign(new Error(`unknown auth provider: ${p.provider}`), {
      exitCode: 2,
    })
  const { id, secret } = resolveAddCreds(p)
  const deps = await openDeps()
  try {
    const scopes = googleOAuthScopes(deps.registry)
    const t = p.refreshToken
      ? { refresh_token: p.refreshToken }
      : await obtainGoogleTokens(p, id, secret, scopes)
    const accountEmail = p.label ?? (await detectGoogleAccountEmail(t))
    const { grantId } = await deps.authService.addGoogleGrant({
      clientId: id,
      clientSecret: secret,
      refreshToken: t.refresh_token,
      ...('access_token' in t && t.access_token
        ? { accessToken: t.access_token }
        : {}),
      scopes: JSON.stringify(scopes),
      ...('expires_at' in t ? { expiresAt: t.expires_at } : {}),
      ...(accountEmail ? { accountEmail } : {}),
    })
    console.log(formatGrantAdded(grantId))
    return 0
  } finally {
    await deps.close()
  }
}

export async function handleAuthCommand(args: string[]): Promise<number> {
  const parsed = parseAuthArgs(args)
  if (parsed.kind === 'help') return 0
  if (parsed.kind === 'unknown') {
    console.error(`${parsed.message}. Try: ${authUsage}`)
    return 2
  }
  try {
    if (parsed.kind === 'add') return await handleAdd(parsed)
    const deps = await openDeps()
    try {
      const rows = await deps.authService.listGoogleGrants()
      console.log(formatGrants(rows, { json: parsed.json }))
      return 0
    } finally {
      await deps.close()
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return mapErrorToExit(err)
  }
}
