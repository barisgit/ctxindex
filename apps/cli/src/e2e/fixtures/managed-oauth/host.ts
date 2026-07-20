import type { AuthService } from '@ctxindex/core/auth'
import { authorizeProvider, selectedOAuthScopes } from '@ctxindex/core/auth'
import { defaultConfig } from '@ctxindex/core/config'
import { loadExtensions } from '@ctxindex/core/extension'
import {
  createOAuthAppService,
  type ManagedOAuthAppPolicy,
  resolveManagedOAuthApp,
} from '@ctxindex/core/oauth-app'
import { keychainRef, type SecretsStore } from '@ctxindex/core/secrets'
import { openDatabase, runMigrations } from '@ctxindex/core/storage'
import * as definitions from './definitions'

class MemoryStore implements SecretsStore {
  readonly values = new Map<string, string>()

  async getSecret(ref: string): Promise<string> {
    const value = this.values.get(ref)
    if (value === undefined) throw new Error('missing fixture secret')
    return value
  }

  async setSecret(scope: string, key: string, value: string): Promise<string> {
    const ref = keychainRef(scope, key)
    this.values.set(ref, value)
    return ref
  }

  async deleteSecret(ref: string): Promise<void> {
    this.values.delete(ref)
  }

  async listKeys() {
    return []
  }
}

const managedPolicy = {
  providerId: 'synthetic.oauth',
  label: 'managed',
  extensionId: 'fixture.managed-oauth',
  distributions: [{ kind: 'bundled', packageName: '@ctxindex/adapters' }],
} as const satisfies ManagedOAuthAppPolicy

const mismatchPolicy = {
  ...managedPolicy,
  distributions: [{ kind: 'bundled', packageName: '@fixture/mismatch' }],
} as const satisfies ManagedOAuthAppPolicy

const loaded = await loadExtensions({
  config: defaultConfig(),
  builtins: definitions,
})
const registry = loaded.completeRegistry
const managedSelection = resolveManagedOAuthApp(
  registry,
  [managedPolicy],
  'synthetic.oauth',
)
const provenanceMismatch = resolveManagedOAuthApp(
  registry,
  [mismatchPolicy],
  'synthetic.oauth',
)
if (managedSelection.status !== 'selected') {
  throw new Error('synthetic managed App was not selected')
}

const db = await openDatabase('managed-oauth.sqlite')
await runMigrations(db)
const store = new MemoryStore()
const apps = createOAuthAppService({ db, store, registry, now: () => 1_000 })
await apps.addLocalApp({
  providerId: 'synthetic.oauth',
  label: 'local',
  config: { clientId: 'synthetic-local-client-canary' },
})

const requestHosts: string[] = []
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  requestHosts.push(url.hostname)
  if (url.hostname === 'auth.synthetic.invalid') {
    return Response.json({
      access_token: 'synthetic-token-canary',
      refresh_token: 'synthetic-refresh-canary',
      expires_in: 60,
      scope: 'community.read managed.read openid shared.read',
    })
  }
  if (url.hostname === 'api.synthetic.invalid') {
    return Response.json({
      sub: 'synthetic-subject',
      email: 'person@synthetic.invalid',
    })
  }
  throw new Error(`unexpected fixture egress host: ${url.hostname}`)
}) as typeof fetch

const authService = {
  addGrant: async () => ({ grantId: 'fixture-grant', accountId: 'fixture' }),
} as unknown as AuthService
const authorize = (app: string) =>
  authorizeProvider(
    { provider: 'synthetic.oauth', app, mode: 'from-env' },
    {
      registry,
      authService,
      resolveApp: (providerId, label) => apps.resolveApp(providerId, label),
      readEnvironment: (name) =>
        name === 'CTXINDEX_OAUTH_REFRESH_TOKEN'
          ? 'synthetic-input-refresh-canary'
          : undefined,
    },
  )

const managed = await authorize(managedSelection.label)
const local = await authorize('local')
const allowedHosts = new Set([
  '127.0.0.1',
  ...definitions.syntheticOAuthProvider.auth.allowedHosts,
])
if (
  requestHosts.some(
    (host) => !allowedHosts.has(host) || host.includes('ctxindex'),
  )
) {
  throw new Error('managed OAuth fixture escaped declared Provider hosts')
}

console.log(
  JSON.stringify({
    managedSelection,
    provenanceMismatch,
    inventory: apps.listApps(),
    requestedScopes: selectedOAuthScopes(registry, 'synthetic.oauth'),
    managedScopes: managed.scopes,
    localScopes: local.scopes,
    requestHosts,
  }),
)
db.close()
