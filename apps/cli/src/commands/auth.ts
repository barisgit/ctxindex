import {
  OAuthTokenResponseSchema,
  safeFetch,
} from '@ctxindex/adapters/google-mailbox'
import { readConfig } from '@ctxindex/core/config'
import {
  CtxindexSecretsError,
  FileBackend,
  loadSecretsStore,
} from '@ctxindex/core/secrets'
import type { CtxindexDatabase } from '@ctxindex/core/storage'
import { ulid } from 'ulid'
import { getDb } from './db'

interface ParsedAuthAdd {
  readonly provider: string
  readonly clientId?: string
  readonly clientSecret?: string
  readonly authCode?: string
  readonly label?: string
}

function parseAuthAdd(args: string[]): ParsedAuthAdd {
  const [provider, ...rest] = args
  const parsed: {
    provider?: string
    clientId?: string
    clientSecret?: string
    authCode?: string
    label?: string
  } = {}
  if (provider !== undefined) parsed.provider = provider

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    const next = rest[index + 1]
    if (arg === '--client-id' && next) {
      parsed.clientId = next
      index += 1
    } else if (arg === '--client-secret' && next) {
      parsed.clientSecret = next
      index += 1
    } else if (arg === '--auth-code' && next) {
      parsed.authCode = next
      index += 1
    } else if (arg === '--label' && next) {
      parsed.label = next
      index += 1
    } else {
      throw Object.assign(new Error(`unknown or incomplete option: ${arg}`), {
        exitCode: 2,
      })
    }
  }

  if (!parsed.provider) {
    throw Object.assign(new Error('auth add: missing <provider>'), {
      exitCode: 2,
    })
  }
  return parsed as ParsedAuthAdd
}

async function loadWritableSecretsStore() {
  try {
    return await loadSecretsStore(await readConfig())
  } catch (err) {
    if (
      err instanceof CtxindexSecretsError &&
      err.code === 'backend_unavailable'
    ) {
      return new FileBackend()
    }
    throw err
  }
}

export async function authAddGoogle(
  db: CtxindexDatabase,
  args: string[],
): Promise<string> {
  const parsed = parseAuthAdd(args)
  if (parsed.provider !== 'google') {
    throw Object.assign(
      new Error(`unknown auth provider: ${parsed.provider}`),
      {
        exitCode: 2,
      },
    )
  }
  if (!parsed.clientId || !parsed.clientSecret || !parsed.authCode) {
    throw Object.assign(
      new Error(
        'auth add google requires --client-id, --client-secret, and --auth-code in headless mode',
      ),
      { exitCode: 2 },
    )
  }

  const token = await safeFetch(
    OAuthTokenResponseSchema,
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: parsed.clientId,
        client_secret: parsed.clientSecret,
        code: parsed.authCode,
        grant_type: 'authorization_code',
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      }).toString(),
    },
  )

  if (token.error === 'invalid_grant' || !token.refresh_token) {
    throw Object.assign(new Error('google auth failed: invalid_grant'), {
      code: 'invalid_grant',
      exitCode: 10,
    })
  }

  const now = Date.now()
  const accountId = ulid()
  const grantId = ulid()
  const store = await loadWritableSecretsStore()
  const accessTokenRef = token.access_token
    ? await store.setSecret(
        'google',
        `access_token:${grantId}`,
        token.access_token,
      )
    : null
  const refreshTokenRef = await store.setSecret(
    'google',
    `refresh_token:${grantId}`,
    token.refresh_token,
  )

  db.prepare(
    `INSERT INTO accounts (id, realm_id, provider, display_name, created_at)
     VALUES (?, 'global', 'google', ?, ?)`,
  ).run(accountId, parsed.label ?? 'google', now)

  db.prepare(
    `INSERT INTO grants
       (id, account_id, provider, scopes, access_token_ref, refresh_token_ref, expires_at, created_at, updated_at)
     VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)`,
  ).run(
    grantId,
    accountId,
    JSON.stringify(['https://www.googleapis.com/auth/gmail.readonly']),
    accessTokenRef,
    refreshTokenRef,
    token.expires_in ? now + token.expires_in * 1000 : null,
    now,
    now,
  )

  return grantId
}

export function authList(db: CtxindexDatabase): Record<string, unknown>[] {
  return db
    .prepare(
      `SELECT a.id AS account_id, a.provider, a.display_name, g.id AS grant_id, g.scopes
       FROM accounts a LEFT JOIN grants g ON g.account_id = a.id
       ORDER BY a.created_at`,
    )
    .all() as Record<string, unknown>[]
}

export async function handleAuthCommand(args: string[]): Promise<number> {
  const [subcommand, ...rest] = args
  const db = await getDb()
  try {
    if (subcommand === 'add') {
      const grantId = await authAddGoogle(db, rest)
      console.log(`auth grant added: ${grantId}`)
      return 0
    }
    if (subcommand === 'list') {
      const json = rest.includes('--json')
      const rows = authList(db)
      if (json) console.log(JSON.stringify(rows, null, 2))
      else
        for (const row of rows)
          console.log(`${row.account_id}\t${row.provider}`)
      return 0
    }
    console.error(
      'usage: ctxindex auth add google --client-id <id> --client-secret <secret> --auth-code <code> | ctxindex auth list [--json]',
    )
    return 2
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    return (err as { exitCode?: number }).exitCode ?? 1
  }
}
