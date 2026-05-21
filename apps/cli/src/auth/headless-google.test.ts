import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyPragmas, runMigrations } from '@ctxindex/core/storage'
import { authAddGoogle } from '../commands/auth'

let db: Database
let sandbox: string
let originalFetch: typeof fetch
let originalEnv: Record<string, string | undefined>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-auth-test-'))
  originalFetch = globalThis.fetch
  originalEnv = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_DATA_HOME: process.env.XDG_DATA_HOME,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    CTXINDEX_CONFIG_HOME: process.env.CTXINDEX_CONFIG_HOME,
    CTXINDEX_DATA_HOME: process.env.CTXINDEX_DATA_HOME,
    CTXINDEX_STATE_HOME: process.env.CTXINDEX_STATE_HOME,
    CTXINDEX_CACHE_HOME: process.env.CTXINDEX_CACHE_HOME,
  }
  process.env.XDG_CONFIG_HOME = join(sandbox, 'config')
  process.env.XDG_DATA_HOME = join(sandbox, 'data')
  process.env.XDG_STATE_HOME = join(sandbox, 'state')
  process.env.XDG_CACHE_HOME = join(sandbox, 'cache')
  delete process.env.CTXINDEX_CONFIG_HOME
  delete process.env.CTXINDEX_DATA_HOME
  delete process.env.CTXINDEX_STATE_HOME
  delete process.env.CTXINDEX_CACHE_HOME

  db = new Database(':memory:', { create: true })
  applyPragmas(db)
  await runMigrations(db)
})

afterEach(async () => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  db.close()
  await rm(sandbox, { recursive: true, force: true })
})

describe('headless google auth', () => {
  test('auth-code exchange persists an account, grant, and refresh token ref without browser', async () => {
    const fetchedHosts: string[] = []
    globalThis.fetch = ((
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const url = new URL(input.toString())
      fetchedHosts.push(url.hostname)
      expect(url.hostname).toBe('oauth2.googleapis.com')
      expect(init?.method).toBe('POST')
      expect(String(init?.body)).toContain('code=auth-code-1')
      return Promise.resolve(
        jsonResponse({
          access_token: 'access-token-secret',
          refresh_token: 'refresh-token-secret',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      )
    }) as unknown as typeof fetch

    const grantId = await authAddGoogle(db, [
      'google',
      '--client-id',
      'client-id',
      '--client-secret',
      'client-secret',
      '--auth-code',
      'auth-code-1',
    ])

    expect(fetchedHosts).toEqual(['oauth2.googleapis.com'])
    const account = db.prepare('SELECT provider FROM accounts').get() as {
      provider: string
    }
    expect(account.provider).toBe('google')
    const grant = db
      .prepare(
        'SELECT id, refresh_token_ref, access_token_ref FROM grants WHERE id = ?',
      )
      .get(grantId) as {
      id: string
      refresh_token_ref: string
      access_token_ref: string
    }
    expect(grant.id).toBe(grantId)
    expect(grant.refresh_token_ref).toMatch(
      /^(file:secrets\.box#|keychain:ctxindex\/)/,
    )
    expect(grant.access_token_ref).toMatch(
      /^(file:secrets\.box#|keychain:ctxindex\/)/,
    )
    expect(grant.refresh_token_ref).not.toContain('refresh-token-secret')
    expect(grant.access_token_ref).not.toContain('access-token-secret')
  })

  test('missing auth-code inputs fail fast without network', async () => {
    globalThis.fetch = (() => {
      throw new Error('fetch should not be called')
    }) as unknown as typeof fetch

    await expect(authAddGoogle(db, ['google'])).rejects.toThrow(
      'requires --client-id, --client-secret, and --auth-code',
    )
  })
})
