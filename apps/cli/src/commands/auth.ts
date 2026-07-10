import { getGoogleAccountEmail } from '@ctxindex/core/auth'
import { getEnv } from '@ctxindex/core/config'
import { defineCommand } from 'citty'
import { type AuthArgs, authUsage, parseAuthArgs } from '../args/auth'
import { obtainGoogleTokens, resolveAddCreds } from '../auth/add-google'
import { GOOGLE_GMAIL_READONLY_SCOPE } from '../auth/google-loopback'
import { openDeps } from '../deps'
import { formatGrantAdded, formatGrants } from '../format/auth'
import { mapErrorToExit, runWithExit } from '../format/exit'

type AddArgs = Extract<AuthArgs, { kind: 'add' }>

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
    const t = p.refreshToken
      ? { refresh_token: p.refreshToken }
      : await obtainGoogleTokens(p, id, secret)
    const accountEmail = p.label ?? (await detectGoogleAccountEmail(t))
    const { grantId } = await deps.authService.addGoogleGrant({
      clientId: id,
      clientSecret: secret,
      refreshToken: t.refresh_token,
      ...('access_token' in t && t.access_token
        ? { accessToken: t.access_token }
        : {}),
      scopes: JSON.stringify([GOOGLE_GMAIL_READONLY_SCOPE]),
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

export const authCommand = defineCommand({
  meta: { name: 'auth', description: 'Manage Google OAuth grants.' },
  subCommands: {
    add: defineCommand({
      meta: { name: 'add', description: 'Add a Google OAuth grant.' },
      args: {
        provider: { type: 'positional', required: false },
        'client-id': { type: 'string', description: 'OAuth client ID' },
        'client-secret': { type: 'string', description: 'OAuth secret' },
        'auth-code': { type: 'string', description: 'OAuth code' },
        'refresh-token': { type: 'string', description: 'Refresh token' },
        label: { type: 'string', description: 'Grant label' },
        loopback: { type: 'boolean', description: 'Use loopback OAuth' },
        'from-env': { type: 'boolean', description: 'Read creds from env' },
      },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAuthCommand(['add', ...rawArgs])),
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List Google OAuth grants.' },
      args: { json: { type: 'boolean', description: 'Print JSON' } },
      run: ({ rawArgs }) =>
        runWithExit(() => handleAuthCommand(['list', ...rawArgs])),
    }),
  },
})
