import { expect, test } from 'bun:test'
import {
  type OAuthAuthorizationResponsePrompt,
  openOAuthLoopback,
} from '@ctxindex/core/auth'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { CtxindexAuthError } from '@ctxindex/core/errors'
import { googleOAuthProvider } from '@ctxindex/official'
import {
  createDaemonRouter,
  type RpcRequestContext,
  type RpcRuntimeIdentity,
} from '@ctxindex/rpc'
import { createRouterClient, ORPCError } from '@orpc/server'
import { type DaemonAccountService, DaemonApplication } from './application'

// Acceptance for the daemon-owned staged OAuth authorization (decision D1):
// the daemon owns state, provider exchange, and the loopback listener; the
// CLI only answers an opaque, one-use, bounded-lifetime authorization stage.

const digest = 'b'.repeat(64)
const runtime: RpcRuntimeIdentity = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
}
const protocol = { id: 'ctxindex.local', version: 3 } as const

function context(
  requestId: string,
  signal = new AbortController().signal,
): RpcRequestContext {
  return {
    requestId,
    signal,
    clientProtocol: protocol,
    clientRuntime: runtime,
  }
}

function application(
  accountService: DaemonAccountService,
  overrides: { readonly authorizationStageTimeoutMs?: number } = {},
) {
  const app = new DaemonApplication({
    protocol,
    runtime,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'account-authorization-test',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: 123,
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    syncService: {
      run: async () => ({
        mode: 'sync',
        results: [],
        skipped: [],
        warnings: [],
      }),
    },
    sourceService: { resolveSourceId: (value) => value, getStatus: () => [] },
    accountService,
    ...overrides,
  })
  app.markReady()
  return app
}

function clientFor(app: DaemonApplication) {
  return createRouterClient(createDaemonRouter(app, { protocol, runtime }), {
    context: {
      requestId: 'router-request',
      clientProtocol: protocol,
      clientRuntime: runtime,
    },
  })
}

async function declaredFailure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (!(error instanceof ORPCError) || !error.defined) throw error
    return error.data as Record<string, unknown>
  }
  throw new Error('Expected a declared RPC failure')
}

// Mirrors the production wiring: the daemon-owned loopback listener races the
// hidden manual response supplied through the authorization stage.
function loopbackAccountService(timeoutMs = 60_000): DaemonAccountService {
  return {
    authorize: async (_input, interaction, signal) => {
      const result = await openOAuthLoopback({
        provider: googleOAuthProvider,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: 'public-client-id',
        scopes: ['openid'],
        timeoutMs,
        noBrowser: true,
        readAuthorizationResponse: interaction.readAuthorizationResponse,
        signal,
      })
      return { accountId: `account-for-${result.code}` }
    },
    list: () => [],
    remove: async () => {},
  }
}

function callbackFor(authorizationUrl: string, code: string, state?: string) {
  const authorization = new URL(authorizationUrl)
  const callback = new URL(
    authorization.searchParams.get('redirect_uri') ?? 'http://localhost/',
  )
  callback.searchParams.set('code', code)
  callback.searchParams.set(
    'state',
    state ?? authorization.searchParams.get('state') ?? '',
  )
  return callback.toString()
}

async function openStage(app: DaemonApplication, requestId: string) {
  const opened = await app.account.add(
    { provider: 'google', app: 'desktop', label: 'work' },
    context(requestId),
  )
  if (!opened.ok) throw new Error('Expected Account stream admission')
  const event = await opened.value.next()
  if (event.done) throw new Error('Expected an authorization stage')
  return { stream: opened.value, event: event.value }
}

test('authorization stage ids are opaque, unique, and accept exactly one response', async () => {
  const app = application(loopbackAccountService())
  const first = await openStage(app, 'first-add')
  const second = await openStage(app, 'second-add')

  expect(Object.keys(first.event).sort()).toEqual([
    'authorizationUrl',
    'requestId',
    'type',
  ])
  expect(first.event.requestId).not.toBe(second.event.requestId)
  const state = new URL(first.event.authorizationUrl).searchParams.get('state')
  for (const leaked of [state, 'google', 'desktop', 'work', 'first-add']) {
    expect(first.event.requestId).not.toContain(String(leaked))
  }

  const response = callbackFor(first.event.authorizationUrl, 'private-code')
  // A concurrent duplicate must not be accepted twice.
  const [accepted, replay] = await Promise.all([
    app.account.respond(
      { requestId: first.event.requestId, response },
      context('first-respond'),
    ),
    app.account.respond(
      { requestId: first.event.requestId, response },
      context('replayed-respond'),
    ),
  ])
  expect(accepted).toEqual({ ok: true, value: { accepted: true } })
  expect(replay).toEqual({
    ok: false,
    error: {
      kind: 'ctxindex',
      taxonomy: 'lookup',
      code: 'not_found',
      message: 'The OAuth authorization request is no longer active.',
    },
  })
  expect(JSON.stringify(replay)).not.toContain('private-code')
  expect(await first.stream.next()).toEqual({
    done: true,
    value: { ok: true, value: { accountId: 'account-for-private-code' } },
  })
  expect(
    await app.account.respond(
      { requestId: first.event.requestId, response },
      context('late-replay'),
    ),
  ).toMatchObject({ ok: false, error: { code: 'not_found' } })

  // The other stage is untouched by the replay and still owns its own id.
  expect(
    await app.account.respond(
      {
        requestId: second.event.requestId,
        response: callbackFor(second.event.authorizationUrl, 'second-code'),
      },
      context('second-respond'),
    ),
  ).toEqual({ ok: true, value: { accepted: true } })
  expect(await second.stream.next()).toEqual({
    done: true,
    value: { ok: true, value: { accountId: 'account-for-second-code' } },
  })
})

test('an unknown request id fails safely without disturbing a pending stage', async () => {
  const app = application(loopbackAccountService())
  const pending = await openStage(app, 'pending-add')

  expect(
    await app.account.respond(
      {
        requestId: 'forged-request-id',
        response: callbackFor(pending.event.authorizationUrl, 'forged-code'),
      },
      context('forged-respond'),
    ),
  ).toMatchObject({
    ok: false,
    error: { taxonomy: 'lookup', code: 'not_found' },
  })
  expect(
    await app.account.respond(
      {
        requestId: pending.event.requestId,
        response: callbackFor(pending.event.authorizationUrl, 'real-code'),
      },
      context('real-respond'),
    ),
  ).toEqual({ ok: true, value: { accepted: true } })
  expect(await pending.stream.next()).toEqual({
    done: true,
    value: { ok: true, value: { accountId: 'account-for-real-code' } },
  })
})

test('a response with a mismatched state fails the authorization and consumes the stage', async () => {
  const app = application(loopbackAccountService())
  const pending = await openStage(app, 'state-add')
  const response = callbackFor(
    pending.event.authorizationUrl,
    'stolen-code',
    'attacker-state',
  )

  expect(
    await app.account.respond(
      { requestId: pending.event.requestId, response },
      context('state-respond'),
    ),
  ).toEqual({ ok: true, value: { accepted: true } })
  const terminal = await pending.stream.next()
  expect(terminal).toMatchObject({
    done: true,
    value: { ok: false, error: { taxonomy: 'auth', code: 'state_mismatch' } },
  })
  expect(JSON.stringify(terminal)).not.toMatch(/stolen-code|attacker-state/)
  expect(
    await app.account.respond(
      { requestId: pending.event.requestId, response },
      context('state-replay'),
    ),
  ).toMatchObject({ ok: false, error: { code: 'not_found' } })
})

test('the authorization stage expires independently of a longer loopback timeout', async () => {
  const app = application(loopbackAccountService(60_000), {
    authorizationStageTimeoutMs: 30,
  })
  const startedAt = performance.now()
  const pending = await openStage(app, 'expiring-add')

  const terminal = await pending.stream.next()
  expect(performance.now() - startedAt).toBeLessThan(10_000)
  expect(terminal).toEqual({
    done: true,
    value: {
      ok: false,
      error: {
        kind: 'ctxindex',
        taxonomy: 'auth',
        code: 'loopback_timeout',
        message:
          'OAuth authorization failed: loopback_timeout (callback timed out)',
      },
    },
  })
  expect(
    await app.account.respond(
      {
        requestId: pending.event.requestId,
        response: callbackFor(pending.event.authorizationUrl, 'late-code'),
      },
      context('expired-respond'),
    ),
  ).toMatchObject({
    ok: false,
    error: { taxonomy: 'lookup', code: 'not_found' },
  })
  expect(app.activeRequestCount).toBe(0)
})

test('cancelling the Account stream withdraws its pending stage', async () => {
  const app = application(loopbackAccountService())
  const controller = new AbortController()
  const opened = await app.account.add(
    { provider: 'google' },
    context('cancelled-add', controller.signal),
  )
  if (!opened.ok) throw new Error('Expected Account stream admission')
  const event = await opened.value.next()
  if (event.done) throw new Error('Expected an authorization stage')

  controller.abort()
  expect(await opened.value.next()).toMatchObject({
    done: true,
    value: { ok: false, error: { kind: 'cancelled' } },
  })
  expect(
    await app.account.respond(
      {
        requestId: event.value.requestId,
        response: callbackFor(event.value.authorizationUrl, 'late-code'),
      },
      context('cancelled-respond'),
    ),
  ).toMatchObject({ ok: false, error: { code: 'not_found' } })
  expect(app.activeRequestCount).toBe(0)
})

test('Account RPC results, events, and failures exclude tokens, App secrets, and provider payloads', async () => {
  const canaries = [
    'access-token-canary',
    'refresh-token-canary',
    'app-secret-canary',
    'provider-payload-canary',
  ]
  let mode: 'auth-error' | 'raw-error' | 'extra-result' = 'auth-error'
  const app = application({
    authorize: async (_input, interaction) => {
      const prompt: OAuthAuthorizationResponsePrompt = {
        authorizationUrl: 'https://accounts.example/authorize?state=s',
        redirectUri: 'http://localhost/callback',
        signal: new AbortController().signal,
      }
      if (mode === 'auth-error') {
        throw new CtxindexAuthError(
          'token_response_invalid',
          `provider said ${canaries.join(' ')}`,
        )
      }
      if (mode === 'raw-error') {
        throw new Error(`{"access_token":"${canaries[0]}"}`)
      }
      await interaction.readAuthorizationResponse(prompt)
      return {
        accountId: 'account-id',
        accessToken: canaries[0],
        refreshToken: canaries[1],
        appConfig: { clientSecret: canaries[2] },
      } as { accountId: string }
    },
    list: () =>
      [
        {
          id: 'account-id',
          provider: 'google',
          label: 'work',
          expiresAt: null,
          expiryState: 'unknown',
          sources: [],
          refreshToken: canaries[1],
        },
      ] as never,
    remove: async () => {
      throw new Error(`grant cleanup failed: ${canaries[3]}`)
    },
  })
  const client = clientFor(app)
  const observed: unknown[] = []

  async function drain() {
    const iterator = await client.account.add({ provider: 'google' })
    for (;;) {
      const step = await iterator.next()
      observed.push(step)
      if (step.done) return step.value
      await app.account.respond(
        { requestId: step.value.requestId, response: 'code' },
        context('respond'),
      )
    }
  }

  observed.push(await declaredFailure(drain()))
  expect(observed.at(-1)).toEqual({
    kind: 'ctxindex',
    taxonomy: 'auth',
    code: 'token_response_invalid',
    message: 'OAuth authorization failed: token_response_invalid',
  })
  mode = 'raw-error'
  observed.push(await declaredFailure(drain()))
  expect(observed.at(-1)).toMatchObject({ code: 'internal_error' })
  mode = 'extra-result'
  observed.push(await declaredFailure(drain()))
  expect(observed.at(-1)).toMatchObject({ code: 'internal_error' })
  observed.push(await declaredFailure(client.account.list({})))
  expect(observed.at(-1)).toMatchObject({ code: 'internal_error' })
  observed.push(await declaredFailure(client.account.remove({ label: 'work' })))
  expect(observed.at(-1)).toMatchObject({ code: 'internal_error' })

  const serialized = JSON.stringify(observed)
  for (const canary of canaries) expect(serialized).not.toContain(canary)
})
