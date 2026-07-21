import { expect, test } from 'bun:test'
import {
  createDocumentationService,
  type DocumentationService,
} from '@ctxindex/core/documentation'
import {
  CtxindexAuthError,
  type CtxindexAuthErrorCode,
  CtxindexNotFoundError,
  CtxindexSyncError,
  type CtxindexSyncErrorCode,
  CtxindexValidationError,
  type CtxindexValidationErrorCode,
} from '@ctxindex/core/errors'
import { CtxindexSecretsError } from '@ctxindex/core/secrets'
import {
  createDaemonRouter,
  type RpcRequestContext,
  type RpcResult,
  type RpcRuntimeIdentity,
  type RpcSyncEvent,
  type RpcSyncResult,
} from '@ctxindex/rpc'
import { createRouterClient, ORPCError } from '@orpc/server'
import { DaemonApplication } from './application'

const digest = 'a'.repeat(64)
const runtime: RpcRuntimeIdentity = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
}

const authCodes = {
  needs_auth: true,
  missing_oauth_app_config: true,
  invalid_grant: true,
  invalid_client: true,
  oauth_failed: true,
  oauth_host_denied: true,
  insufficient_scope: true,
  token_response_invalid: true,
  identity_response_invalid: true,
  authorization_denied: true,
  loopback_timeout: true,
  missing_code: true,
  state_mismatch: true,
  network_error: true,
  token_refresh_failed: true,
  unknown_auth_error: true,
  unknown: true,
  not_implemented_yet: true,
} as const satisfies Record<CtxindexAuthErrorCode, true>

const syncCodes = {
  auth_expired: true,
  auth_revoked: true,
  rate_limited: true,
  network: true,
  provider_unavailable: true,
  provider_bad_response: true,
  provider_quota: true,
  not_found: true,
  permission_denied: true,
  cancelled: true,
  unknown: true,
  not_implemented_yet: true,
} as const satisfies Record<CtxindexSyncErrorCode, true>

const validationCodes = {
  invalid_account_identity: true,
  invalid_oauth_selection: true,
  duplicate_realm_slug: true,
  unknown_realm: true,
  invalid_filter: true,
  invalid_ref: true,
  invalid_artifact_ref: true,
  invalid_artifact_retention: true,
  unsupported_export_format: true,
  ref_source_mismatch: true,
  unknown_action: true,
  invalid_action_input: true,
  action_unsupported: true,
  confirmation_required: true,
} as const satisfies Record<CtxindexValidationErrorCode, true>

function context(
  requestId: string,
  signal = new AbortController().signal,
): RpcRequestContext {
  return {
    requestId,
    signal,
    clientProtocol: { id: 'ctxindex.local', version: 2 },
    clientRuntime: runtime,
  }
}

function application(overrides: Record<string, unknown> = {}) {
  return new DaemonApplication({
    protocol: { id: 'ctxindex.local', version: 2 },
    runtime,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'instance-test',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: 123,
    extensionDiagnosticsCount: 0,
    documentationService: createDocumentationService([]),
    observationTimeoutMs: 25,
    syncService: {
      run: async () => ({ mode: 'sync', results: [], warnings: [] }),
    },
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () => [],
    },
    ...overrides,
  })
}

class TestIdleClock {
  now = 0
  #nextId = 0
  readonly #timers = new Map<
    number,
    { readonly deadline: number; readonly callback: () => void }
  >()

  readonly hooks = {
    now: () => this.now,
    setTimeout: (callback: () => void, delayMs: number): number => {
      const id = this.#nextId++
      this.#timers.set(id, { deadline: this.now + delayMs, callback })
      return id
    },
    clearTimeout: (id: unknown): void => {
      if (typeof id === 'number') this.#timers.delete(id)
    },
  }

  advance(milliseconds: number, run = true): void {
    this.now += milliseconds
    if (run) this.runDue()
  }

  runDue(): void {
    while (true) {
      const due = [...this.#timers.entries()]
        .filter(([, timer]) => timer.deadline <= this.now)
        .sort((left, right) => left[1].deadline - right[1].deadline)[0]
      if (!due) return
      this.#timers.delete(due[0])
      due[1].callback()
    }
  }

  takeDue(): () => void {
    const due = [...this.#timers.entries()]
      .filter(([, timer]) => timer.deadline <= this.now)
      .sort((left, right) => left[1].deadline - right[1].deadline)[0]
    if (!due) throw new Error('Expected a due timer')
    this.#timers.delete(due[0])
    return due[1].callback
  }
}

async function consumeApplicationSync(
  promise: ReturnType<DaemonApplication['sync']['run']>,
): Promise<{
  readonly result: RpcResult<RpcSyncResult>
  readonly events: readonly RpcSyncEvent[]
}> {
  const opened = await promise
  if (!opened.ok) return { result: opened, events: [] }
  const events: RpcSyncEvent[] = []
  while (true) {
    const step = await opened.value.next()
    if (step.done) return { result: step.value, events }
    events.push(step.value)
  }
}

async function consumeRpcSync(
  promise: ReturnType<ReturnType<typeof clientFor>['sync']['run']>,
): Promise<{
  readonly result: RpcSyncResult
  readonly events: readonly RpcSyncEvent[]
}> {
  const iterator = await promise
  const events: RpcSyncEvent[] = []
  while (true) {
    const step = await iterator.next()
    if (step.done) return { result: step.value, events }
    events.push(step.value)
  }
}

test('Account authorization streams one URL and accepts one hidden response without echoing it', async () => {
  const observed: string[] = []
  const app = application({
    createAuthorizationRequestId: () => 'authorization-request',
    accountService: {
      authorize: async (
        _input: unknown,
        interaction: {
          readonly readAuthorizationResponse: (prompt: {
            readonly authorizationUrl: string
            readonly redirectUri: string
            readonly signal: AbortSignal
          }) => Promise<string | undefined>
        },
      ) => {
        const response = await interaction.readAuthorizationResponse({
          authorizationUrl:
            'https://accounts.example/authorize?state=opaque-state',
          redirectUri: 'http://localhost/callback',
          signal: new AbortController().signal,
        })
        if (response !== undefined) observed.push(response)
        return { accountId: 'account-id' }
      },
      list: () => [],
      remove: async () => {},
    },
  })
  app.markReady()
  const opened = await app.account.add(
    { provider: 'google', app: 'desktop', label: 'personal' },
    context('account-add'),
  )
  if (!opened.ok) throw new Error('Expected Account stream admission')
  expect(await opened.value.next()).toEqual({
    done: false,
    value: {
      type: 'authorization.required',
      requestId: 'authorization-request',
      authorizationUrl: 'https://accounts.example/authorize?state=opaque-state',
    },
  })
  const accepted = await app.account.respond(
    {
      requestId: 'authorization-request',
      response:
        'http://localhost/callback?code=private-code&state=opaque-state',
    },
    context('account-respond'),
  )
  expect(accepted).toEqual({ ok: true, value: { accepted: true } })
  const terminal = await opened.value.next()
  expect(terminal).toEqual({
    done: true,
    value: { ok: true, value: { accountId: 'account-id' } },
  })
  expect(observed).toEqual([
    'http://localhost/callback?code=private-code&state=opaque-state',
  ])
  expect(JSON.stringify(accepted)).not.toContain('private-code')
  expect(JSON.stringify(terminal)).not.toContain('private-code')
})

test('automatic loopback completion aborts and removes pending manual input', async () => {
  const app = application({
    createAuthorizationRequestId: () => 'automatic-request',
    accountService: {
      authorize: async (
        _input: unknown,
        interaction: {
          readonly readAuthorizationResponse: (prompt: {
            readonly authorizationUrl: string
            readonly redirectUri: string
            readonly signal: AbortSignal
          }) => Promise<string | undefined>
        },
      ) => {
        const manual = new AbortController()
        const response = interaction.readAuthorizationResponse({
          authorizationUrl: 'https://accounts.example/authorize',
          redirectUri: 'http://localhost/callback',
          signal: manual.signal,
        })
        manual.abort()
        expect(await response).toBeUndefined()
        return { accountId: 'account-id' }
      },
      list: () => [],
      remove: async () => {},
    },
  })
  app.markReady()
  const opened = await app.account.add(
    { provider: 'google' },
    context('automatic-account'),
  )
  if (!opened.ok) throw new Error('Expected Account stream admission')
  expect((await opened.value.next()).done).toBe(false)
  expect(await opened.value.next()).toEqual({
    done: true,
    value: { ok: true, value: { accountId: 'account-id' } },
  })
  expect(
    await app.account.respond(
      { requestId: 'automatic-request', response: 'late-private-code' },
      context('late-response'),
    ),
  ).toMatchObject({ ok: false, error: { taxonomy: 'lookup' } })
})

test('Account and OAuth App inventory mutations delegate with safe result shapes', async () => {
  const events: string[] = []
  const app = application({
    accountService: {
      authorize: async () => ({ accountId: 'unused' }),
      list: () => [
        {
          id: 'account-id',
          provider: 'google',
          label: 'personal',
          expiresAt: null,
          expiryState: 'unknown',
          sources: [],
        },
      ],
      remove: async (label: string) => events.push(`account:${label}`),
    },
    oauthAppService: {
      registration: () => ({ clientId: 'CTXINDEX_GOOGLE_CLIENT_ID' }),
      add: async (input: { provider: string; label: string }) =>
        events.push(`app-add:${input.provider}:${input.label}`),
      list: () => [
        {
          providerId: 'google',
          label: 'desktop',
          origin: 'local',
          provenance: { kind: 'local' },
        },
      ],
      remove: async (provider: string, label: string) =>
        events.push(`app-remove:${provider}:${label}`),
    },
  })
  app.markReady()
  expect(await app.account.list({}, context('account-list'))).toMatchObject({
    ok: true,
    value: { rows: [{ id: 'account-id' }] },
  })
  expect(
    await app.account.remove({ label: 'personal' }, context('account-remove')),
  ).toEqual({ ok: true, value: { label: 'personal' } })
  expect(
    await app.oauthApp.registration(
      { provider: 'google' },
      context('app-registration'),
    ),
  ).toEqual({
    ok: true,
    value: { environment: { clientId: 'CTXINDEX_GOOGLE_CLIENT_ID' } },
  })
  const secret = 'private-client-secret'
  expect(
    await app.oauthApp.add(
      {
        provider: 'google',
        label: 'desktop',
        config: { clientId: 'public-id', clientSecret: secret },
      },
      context('app-add'),
    ),
  ).toEqual({
    ok: true,
    value: { providerId: 'google', label: 'desktop' },
  })
  const listed = await app.oauthApp.list({}, context('app-list'))
  expect(listed).toMatchObject({
    ok: true,
    value: { rows: [{ providerId: 'google', label: 'desktop' }] },
  })
  expect(JSON.stringify(listed)).not.toContain(secret)
  expect(
    await app.oauthApp.remove(
      { provider: 'google', label: 'desktop' },
      context('app-remove'),
    ),
  ).toEqual({
    ok: true,
    value: { providerId: 'google', label: 'desktop' },
  })
  expect(events).toEqual([
    'account:personal',
    'app-add:google:desktop',
    'app-remove:google:desktop',
  ])
})

test('tracks a business request and propagates request cancellation', async () => {
  let observed: AbortSignal | undefined
  const app = application({
    syncService: {
      run: ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          observed = signal
          signal.addEventListener(
            'abort',
            () => resolve({ mode: 'sync', results: [], warnings: [] }),
            { once: true },
          )
        }),
    },
  })
  app.markReady()
  const controller = new AbortController()
  const opened = await app.sync.run(
    { mode: 'sync' },
    context('one', controller.signal),
  )
  if (!opened.ok) throw new Error('Expected stream admission')
  const pending = opened.value.next()
  await Promise.resolve()
  expect(app.activeRequestCount).toBe(1)
  controller.abort()
  expect(await pending).toEqual({
    done: true,
    value: {
      ok: false,
      error: {
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The request was cancelled.',
      },
    },
  })
  expect(observed?.aborted).toBe(true)
  expect(app.activeRequestCount).toBe(0)
})

test('serves safe secret status and backend switching as serialized business work', async () => {
  const calls: string[] = []
  let releaseSwitch!: () => void
  const switchBlocked = new Promise<void>((resolve) => {
    releaseSwitch = resolve
  })
  const app = application({
    secretBackendManager: {
      async getStatus() {
        calls.push('status')
        return {
          backend: 'keychain' as const,
          backends: {
            file: { available: true, referenceCount: 2 },
            keychain: { available: true, referenceCount: 0 },
          },
        }
      },
      async switchBackend(target: 'keychain' | 'file') {
        calls.push(`set:${target}`)
        await switchBlocked
        return {
          backend: target,
          copied: 2,
          cleaned: 1,
          cleanupPending: true,
          warnings: ['secret-canary keychain:ctxindex/private/token'],
        }
      },
    },
  })
  app.markReady()

  const switching = app.secrets.backend.set(
    { target: 'file' },
    context('secrets-set'),
  )
  await Promise.resolve()
  const status = app.secrets.status({}, context('secrets-status'))
  await Promise.resolve()
  expect(calls).toEqual(['set:file'])
  expect(app.activeRequestCount).toBe(2)

  releaseSwitch()
  expect(await switching).toEqual({
    ok: true,
    value: {
      backend: 'file',
      copied: 2,
      cleaned: 1,
      cleanupPending: true,
      warnings: ['Secret backend cleanup remains pending.'],
    },
  })
  expect(await status).toEqual({
    ok: true,
    value: {
      backend: 'keychain',
      backends: {
        file: { available: true, referenceCount: 2 },
        keychain: { available: true, referenceCount: 0 },
      },
    },
  })
  expect(calls).toEqual(['set:file', 'status'])
  expect(JSON.stringify(await switching)).not.toContain('secret-canary')
})

test('maps secret backend failures to bounded messages without references', async () => {
  const app = application({
    secretBackendManager: {
      async getStatus() {
        throw new CtxindexSecretsError(
          'keychain:ctxindex/private/token secret-canary',
          'backend_unavailable',
        )
      },
      async switchBackend() {
        throw new Error('unused')
      },
    },
  })
  app.markReady()
  const result = await app.secrets.status({}, context('secrets-failure'))
  expect(result).toEqual({
    ok: false,
    error: {
      kind: 'ctxindex',
      taxonomy: 'other',
      code: 'backend_unavailable',
      message: 'The configured secret backend is unavailable.',
    },
  })
  expect(JSON.stringify(result)).not.toMatch(/secret-canary|keychain:ctxindex/)
})

test('backend migration waits for active secret-using business work', async () => {
  const calls: string[] = []
  let releaseSearch!: () => void
  const searchBlocked = new Promise<void>((resolve) => {
    releaseSearch = resolve
  })
  const app = application({
    searchService: {
      async search() {
        calls.push('search')
        await searchBlocked
        return { results: [], warnings: [] }
      },
    },
    secretBackendManager: {
      async getStatus() {
        throw new Error('unused')
      },
      async switchBackend(target: 'keychain' | 'file') {
        calls.push(`set:${target}`)
        return {
          backend: target,
          copied: 0,
          cleaned: 0,
          cleanupPending: false,
          warnings: [],
        }
      },
    },
  })
  app.markReady()

  const search = app.search.query(
    { text: 'fixture' },
    context('search-before-secret-migration'),
  )
  await Promise.resolve()
  const switching = app.secrets.backend.set(
    { target: 'keychain' },
    context('secret-migration-after-search'),
  )
  await Promise.resolve()
  expect(calls).toEqual(['search'])

  releaseSearch()
  expect(await search).toMatchObject({ ok: true })
  expect(await switching).toMatchObject({
    ok: true,
    value: { backend: 'keychain' },
  })
  expect(calls).toEqual(['search', 'set:keychain'])
})

test('streams bounded progress in order with one-item producer backpressure', async () => {
  let firstAccepted = false
  const app = application({
    syncService: {
      run: async ({
        onEvent,
      }: {
        onEvent?: (event: {
          type: 'source.started' | 'source.progress'
          sequence: number
          sourceId: string
          mode?: 'sync'
          processed?: number
          upserts?: number
          removals?: number
          checkpoints?: number
          warningsCount?: number
        }) => Promise<void>
      }) => {
        await onEvent?.({
          type: 'source.started',
          sequence: 0,
          sourceId: 'source-1',
          mode: 'sync',
        })
        firstAccepted = true
        await onEvent?.({
          type: 'source.progress',
          sequence: 1,
          sourceId: 'source-1',
          processed: 1,
          upserts: 1,
          removals: 0,
          checkpoints: 0,
          warningsCount: 0,
        })
        return { mode: 'sync' as const, results: [], warnings: [] }
      },
    },
  })
  app.markReady()
  const opened = await app.sync.run({ mode: 'sync' }, context('stream'))
  if (!opened.ok) throw new Error('Expected stream admission')
  await Promise.resolve()
  expect(firstAccepted).toBe(false)
  expect(app.activeRequestCount).toBe(1)

  expect(await opened.value.next()).toEqual({
    done: false,
    value: {
      type: 'source.started',
      sequence: 0,
      sourceId: 'source-1',
      mode: 'sync',
    },
  })
  await Promise.resolve()
  expect(firstAccepted).toBe(true)
  expect(await opened.value.next()).toEqual({
    done: false,
    value: {
      type: 'source.progress',
      sequence: 1,
      sourceId: 'source-1',
      processed: 1,
      upserts: 1,
      removals: 0,
      checkpoints: 0,
      warningsCount: 0,
    },
  })
  expect(await opened.value.next()).toEqual({
    done: true,
    value: {
      ok: true,
      value: { mode: 'sync', results: [], warnings: [] },
    },
  })
  expect(app.activeRequestCount).toBe(0)
})

test('keeps stream activity admitted until the consumer observes its terminal result', async () => {
  const clock = new TestIdleClock()
  const app = application({
    idleTimeoutMs: 1_000,
    idleTimer: clock.hooks,
  })
  app.markReady()
  const opened = await app.sync.run(
    { mode: 'sync' },
    context('terminal-pending'),
  )
  if (!opened.ok) throw new Error('Expected stream admission')

  await Bun.sleep(0)
  expect(app.activeRequestCount).toBe(1)
  clock.advance(2_000)
  expect(app.lifecycle).toBe('ready')

  expect(await opened.value.next()).toEqual({
    done: true,
    value: {
      ok: true,
      value: { mode: 'sync', results: [], warnings: [] },
    },
  })
  expect(app.activeRequestCount).toBe(0)
  clock.advance(999)
  expect(app.lifecycle).toBe('ready')
  clock.advance(1)
  expect(app.lifecycle).toBe('stopping')
})

test('returning the stream early cancels and settles the producer', async () => {
  let observed: AbortSignal | undefined
  const app = application({
    syncService: {
      run: async ({
        signal,
        onEvent,
      }: {
        signal: AbortSignal
        onEvent?: (event: {
          type: 'source.started'
          sequence: number
          sourceId: string
          mode: 'sync'
        }) => Promise<void>
      }) => {
        observed = signal
        await onEvent?.({
          type: 'source.started',
          sequence: 0,
          sourceId: 'source-1',
          mode: 'sync',
        })
        return { mode: 'sync', results: [], warnings: [] }
      },
    },
  })
  app.markReady()
  const opened = await app.sync.run({ mode: 'sync' }, context('return-early'))
  if (!opened.ok) throw new Error('Expected stream admission')
  expect(app.activeRequestCount).toBe(1)
  await opened.value.return?.()
  expect(observed?.aborted).toBe(true)
  expect(app.activeRequestCount).toBe(0)
})

test('unavailable business requests describe starting and stopping lifecycle', async () => {
  const app = application()

  const starting = await app.status.get({}, context('starting'))
  expect(starting).toEqual({
    ok: false,
    error: {
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message: 'The daemon is starting and is not yet accepting work.',
    },
  })

  app.beginStopping()
  const stopping = await app.status.get({}, context('stopping'))
  expect(stopping).toEqual({
    ok: false,
    error: {
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message: 'The daemon is stopping and is not accepting new work.',
    },
  })
})

test('projects loaded Extension documentation as bounded content-safe RPC values', async () => {
  const markdown = {
    origin: { kind: 'extension' as const, extensionId: 'fixture.docs' },
    path: 'README.md',
    kind: 'markdown' as const,
    mediaType: 'text/markdown',
    byteSize: 9,
    title: 'Fixture',
    content: '# Fixture',
  }
  const asset = {
    origin: { kind: 'extension' as const, extensionId: 'fixture.docs' },
    path: 'assets/pixel.png',
    kind: 'asset' as const,
    mediaType: 'image/png',
    byteSize: 8,
    content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
  }
  const documentationService: DocumentationService = {
    list: () => [markdown, asset],
    get: ({ path }) => (path === asset.path ? asset : markdown),
    search: () => [
      {
        origin: markdown.origin,
        path: markdown.path,
        title: markdown.title,
        snippet: '# Fixture',
      },
    ],
  }
  const app = application({ documentationService })
  expect(
    await app.documentation.list({}, context('docs-starting')),
  ).toMatchObject({ ok: false, error: { kind: 'daemon_unavailable' } })
  app.markReady()

  expect(await app.documentation.list({}, context('docs-list'))).toEqual({
    ok: true,
    value: {
      rows: [
        {
          extensionId: 'fixture.docs',
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          byteSize: 9,
          title: 'Fixture',
        },
        {
          extensionId: 'fixture.docs',
          path: 'assets/pixel.png',
          kind: 'asset',
          mediaType: 'image/png',
          byteSize: 8,
        },
      ],
    },
  })
  expect(
    await app.documentation.get(
      { extensionId: 'fixture.docs', path: 'assets/pixel.png' },
      context('docs-get'),
    ),
  ).toEqual({
    ok: true,
    value: {
      item: {
        extensionId: 'fixture.docs',
        path: 'assets/pixel.png',
        kind: 'asset',
        mediaType: 'image/png',
        byteSize: 8,
        contentBase64: 'iVBORw0KGgo=',
      },
    },
  })
  expect(
    await app.documentation.search(
      { query: 'fixture' },
      context('docs-search'),
    ),
  ).toEqual({
    ok: true,
    value: {
      rows: [
        {
          extensionId: 'fixture.docs',
          path: 'README.md',
          title: 'Fixture',
          snippet: '# Fixture',
        },
      ],
    },
  })
  expect(
    await clientFor(app).documentation.get({
      extensionId: 'fixture.docs',
      path: 'README.md',
    }),
  ).toMatchObject({ item: { content: '# Fixture' } })
})

test('rejects oversized documentation output without truncation', async () => {
  const content = 'x'.repeat(256 * 1_024 + 1)
  const app = application({
    documentationService: {
      list: () => [],
      get: () => ({
        origin: { kind: 'extension', extensionId: 'fixture.docs' },
        path: 'README.md',
        kind: 'markdown',
        mediaType: 'text/markdown',
        byteSize: content.length,
        content,
      }),
      search: () => [],
    },
  })
  app.markReady()
  expect(
    await app.documentation.get(
      { extensionId: 'fixture.docs', path: 'README.md' },
      context('docs-too-large'),
    ),
  ).toEqual({
    ok: false,
    error: {
      kind: 'result_too_large',
      code: 'result_too_large',
      message: 'The daemon result exceeds the local protocol bounds.',
    },
  })
})

test('rejects terminal-active documentation output at the RPC boundary', async () => {
  const content = '# Fixture\u001b]0;unsafe\u0007'
  const app = application({
    documentationService: {
      list: () => [],
      get: () => ({
        origin: { kind: 'extension', extensionId: 'fixture.docs' },
        path: 'README.md',
        kind: 'markdown',
        mediaType: 'text/markdown',
        byteSize: new TextEncoder().encode(content).byteLength,
        content,
      }),
      search: () => [],
    },
  })
  app.markReady()
  expect(
    await app.documentation.get(
      { extensionId: 'fixture.docs', path: 'README.md' },
      context('docs-terminal-control'),
    ),
  ).toEqual({
    ok: false,
    error: {
      kind: 'result_too_large',
      code: 'result_too_large',
      message: 'The daemon result exceeds the local protocol bounds.',
    },
  })
})

test('shutdown stops admission, cancels active work, and is idempotent', async () => {
  let settle!: () => void
  let operationSignal: AbortSignal | undefined
  const app = application({
    syncService: {
      run: ({ signal }: { signal: AbortSignal }) => {
        operationSignal = signal
        return new Promise((resolve) => {
          settle = () => resolve({ mode: 'sync', results: [], warnings: [] })
        })
      },
    },
  })
  app.markReady()
  const opened = await app.sync.run({ mode: 'sync' }, context('active'))
  if (!opened.ok) throw new Error('Expected stream admission')
  const pending = opened.value.next()
  await Promise.resolve()
  const first = await app.system.shutdown({}, context('shutdown-1'))
  const second = await app.system.shutdown({}, context('shutdown-2'))
  expect(first.ok && first.value.alreadyStopping).toBe(false)
  expect(second.ok && second.value.alreadyStopping).toBe(true)
  expect(operationSignal?.aborted).toBe(true)
  expect((await app.status.get({}, context('rejected'))).ok).toBe(false)
  settle()
  await pending
  await app.whenDrained()
})

test('idle shutdown waits for active work and resets from admission and settlement', async () => {
  const clock = new TestIdleClock()
  const stopping: number[] = []
  let settle!: () => void
  const app = application({
    idleTimeoutMs: 1_000,
    idleTimer: clock.hooks,
    onStopping: () => stopping.push(clock.now),
    syncService: {
      run: () =>
        new Promise((resolve) => {
          settle = () => resolve({ mode: 'sync', results: [], warnings: [] })
        }),
    },
  })
  app.markReady()
  clock.advance(900)

  const opened = await app.sync.run({ mode: 'sync' }, context('idle-active'))
  if (!opened.ok) throw new Error('Expected stream admission')
  const pending = opened.value.next()

  clock.advance(1_100)
  expect(app.lifecycle).toBe('ready')
  settle()
  await pending
  await app.whenDrained()

  clock.advance(999)
  expect(app.lifecycle).toBe('ready')
  clock.advance(1)
  expect(app.lifecycle).toBe('stopping')
  expect(stopping).toEqual([3_000])
})

test('health and status observation do not extend the idle deadline', async () => {
  const clock = new TestIdleClock()
  const app = application({
    idleTimeoutMs: 1_000,
    idleTimer: clock.hooks,
  })
  app.markReady()
  clock.advance(900)

  expect((await app.system.health({}, context('idle-health'))).ok).toBe(true)
  expect((await app.status.get({}, context('idle-status'))).ok).toBe(true)
  clock.advance(100)

  expect(app.lifecycle).toBe('stopping')
})

test('business admission at the idle deadline wins atomically over shutdown', async () => {
  const clock = new TestIdleClock()
  let settle!: () => void
  const app = application({
    idleTimeoutMs: 1_000,
    idleTimer: clock.hooks,
    syncService: {
      run: () =>
        new Promise((resolve) => {
          settle = () => resolve({ mode: 'sync', results: [], warnings: [] })
        }),
    },
  })
  app.markReady()
  clock.advance(1_000, false)
  const staleDeadline = clock.takeDue()

  const opened = await app.sync.run({ mode: 'sync' }, context('idle-race'))
  if (!opened.ok) throw new Error('Expected stream admission')
  const pending = opened.value.next()
  settle()
  await pending
  staleDeadline()

  expect(app.lifecycle).toBe('ready')
})

test('maps core failures and diagnostics without leaking unsafe text', async () => {
  const canary = 'client-secret-canary'
  const app = application({
    syncService: {
      run: async () => ({
        mode: 'sync',
        results: [
          {
            sourceId: 'source-1',
            status: 'failed',
            error: Object.assign(
              new Error(
                `${canary} /Users/person/token EADDRINUSE {"rawProviderBody":"body"}`,
                { cause: new Error(`${canary} nested cause`) },
              ),
              { code: 'provider_bad_response' },
            ),
            diagnostics: {
              warningsCount: 1,
              lastWarning: {
                code: 'item_skipped',
                message: 'One item was skipped.',
                ref: 'ctx://source-1/item-1',
              },
              errorsCount: 1,
              lastError: `${canary} unix:/tmp/daemon.sock ECONNRESET {"rawProviderBody":"body"}`,
            },
          },
        ],
        warnings: [],
      }),
    },
  })
  app.markReady()
  const { result, events } = await consumeApplicationSync(
    app.sync.run({ mode: 'sync' }, context('safe')),
  )
  const serialized = JSON.stringify({ result, events })
  expect(serialized).not.toContain('/Users')
  expect(serialized).not.toContain('/tmp')
  expect(serialized).not.toContain(canary)
  expect(serialized).not.toContain('EADDRINUSE')
  expect(serialized).not.toContain('ECONNRESET')
  expect(serialized).not.toContain('rawProviderBody')
  expect(serialized).not.toContain('nested cause')
  expect(serialized).not.toContain('stack')
  expect(serialized).toContain('provider_bad_response')
  expect(serialized).toContain('One item was skipped.')
  expect(serialized).toContain('ctx://source-1/item-1')
  expect(serialized).toContain(
    'Sync failed for Source \\"source-1\\" (provider_bad_response)',
  )
})

test('sync preserves trusted unknown and disabled Source validation failures through RPC', async () => {
  const failures = [
    'Source not found: "missing"',
    'Source is not sync-enabled: "disabled"',
  ]
  for (const [index, message] of failures.entries()) {
    const app = application({
      syncService: {
        run: async () => {
          throw new CtxindexValidationError('invalid_filter', message)
        },
      },
    })
    app.markReady()
    const expected = {
      ok: false as const,
      error: {
        kind: 'ctxindex' as const,
        taxonomy: 'validation' as const,
        code: 'invalid_filter',
        message,
      },
    }
    expect(
      (
        await consumeApplicationSync(
          app.sync.run(
            { mode: 'sync', source: index === 0 ? 'missing' : 'disabled' },
            context(`sync-validation-${index}`),
          ),
        )
      ).result,
    ).toEqual(expected)
    expect(
      await rpcFailure(
        consumeRpcSync(
          clientFor(app).sync.run({
            mode: 'sync',
            source: index === 0 ? 'missing' : 'disabled',
          }),
        ),
      ),
    ).toEqual(expected.error)
  }
})

test('status preserves trusted unknown Source failure through RPC', async () => {
  const message = 'source not found: "missing"'
  const app = application({
    sourceService: {
      resolveSourceId: () => {
        throw new CtxindexNotFoundError(message)
      },
      getStatus: () => [],
    },
  })
  app.markReady()
  const expected = {
    ok: false as const,
    error: {
      kind: 'ctxindex' as const,
      taxonomy: 'lookup' as const,
      code: 'not_found',
      message,
    },
  }
  expect(
    await app.status.get({ source: 'missing' }, context('status-not-found')),
  ).toEqual(expected)
  expect(
    await rpcFailure(clientFor(app).status.get({ source: 'missing' })),
  ).toEqual(expected.error)
})

test('resource failures preserve every auth and sync taxonomy code through RPC', async () => {
  for (const code of Object.keys(authCodes) as CtxindexAuthErrorCode[]) {
    const app = application({
      resourceService: {
        get: async () => {
          throw new CtxindexAuthError(code, `private ${code} detail`)
        },
      },
    })
    app.markReady()
    const result = await rpcFailure(
      clientFor(app).resource.get({
        ref: 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/one',
      }),
    )
    expect(result).toEqual({
      kind: 'ctxindex',
      taxonomy: 'auth',
      code,
      message: `OAuth authorization failed: ${code}`,
    })
  }

  for (const code of Object.keys(syncCodes) as CtxindexSyncErrorCode[]) {
    const retryAfterMs = code === 'rate_limited' ? 2_500 : undefined
    const app = application({
      resourceService: {
        get: async () => {
          throw new CtxindexSyncError(`private ${code} detail`, code, {
            ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          })
        },
      },
    })
    app.markReady()
    const result = await rpcFailure(
      clientFor(app).resource.get({
        ref: 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/one',
      }),
    )
    expect(result).toEqual({
      kind: 'ctxindex',
      taxonomy: 'sync',
      code,
      message: 'The daemon could not complete the request.',
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
    })
  }
})

test('sync failures preserve every validation taxonomy code through RPC', async () => {
  for (const code of Object.keys(
    validationCodes,
  ) as CtxindexValidationErrorCode[]) {
    const app = application({
      syncService: {
        run: async () => {
          throw new CtxindexValidationError(code, code)
        },
      },
    })
    app.markReady()
    expect(
      await rpcFailure(
        consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })),
      ),
    ).toEqual({
      kind: 'ctxindex',
      taxonomy: 'validation',
      code,
      message: code,
    })
  }
})

test('sync projection omits an out-of-bounds retry delay', async () => {
  const app = application({
    resourceService: {
      get: async () => {
        throw new CtxindexSyncError('private rate detail', 'rate_limited', {
          retryAfterMs: 60_001,
        })
      },
    },
  })
  app.markReady()
  expect(
    await rpcFailure(
      clientFor(app).resource.get({
        ref: 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/one',
      }),
    ),
  ).toEqual({
    kind: 'ctxindex',
    taxonomy: 'sync',
    code: 'rate_limited',
    message: 'The daemon could not complete the request.',
  })
})

test('raw errors cannot impersonate trusted public validation failures', async () => {
  const canary = 'raw-invalid-filter-secret'
  const app = application({
    syncService: {
      run: async () => {
        throw Object.assign(new Error(canary), { code: 'invalid_filter' })
      },
    },
  })
  app.markReady()
  const result = await rpcFailure(
    consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })),
  )
  expect(result).toEqual({
    kind: 'ctxindex',
    taxonomy: 'other',
    code: 'internal_error',
    message: 'The daemon could not complete the request.',
  })
  expect(JSON.stringify(result)).not.toContain(canary)
})

test('status preserves established public warning and status fields through RPC', async () => {
  const publicRow = {
    sourceId: 'source-1',
    adapterId: 'adapter-1',
    realmSlug: 'realm-1',
    availability: 'available' as const,
    lastStatus: 'provider_public_status',
    lastRunAt: null,
    warningsCount: 1,
    lastWarning: {
      code: 'item_skipped',
      message: 'One public warning.',
      ref: 'ctx://source-1/item-1',
    },
    errorsCount: 1,
    lastError: 'Public bounded status error.',
    cursor: null,
  }
  const app = application({
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () => [publicRow],
    },
  })
  app.markReady()
  const direct = await app.status.get({}, context('status-direct'))
  const rpc = await clientFor(app).status.get({})
  expect(direct).toEqual({ ok: true, value: { rows: [publicRow] } })
  if (!direct.ok) throw new Error('Expected direct status success')
  expect(rpc).toEqual(direct.value)
})

function clientFor(app: DaemonApplication) {
  const requestContext = context('bounded-output')
  return createRouterClient(
    createDaemonRouter(app, {
      protocol: { id: 'ctxindex.local', version: 2 },
      runtime,
    }),
    {
      context: {
        requestId: requestContext.requestId,
        clientProtocol: requestContext.clientProtocol,
        clientRuntime: requestContext.clientRuntime,
      },
    },
  )
}

async function rpcFailure(promise: Promise<unknown>) {
  try {
    await promise
    throw new Error('Expected declared RPC failure')
  } catch (error) {
    if (!(error instanceof ORPCError) || !error.defined) throw error
    return error.data
  }
}

const statusRow = {
  sourceId: 'source-1',
  adapterId: 'adapter-1',
  realmSlug: 'realm-1',
  availability: 'available' as const,
  lastStatus: 'idle',
  lastRunAt: null,
  warningsCount: 0,
  lastWarning: null,
  errorsCount: 0,
  lastError: null,
  cursor: null,
}

const completedRun = {
  runId: 'run-1',
  mode: 'sync' as const,
  status: 'completed' as const,
  added: 0,
  updated: 0,
  deleted: 0,
  warningsCount: 0,
  lastWarning: null,
  errorsCount: 0,
  warnings: [],
}

test('completed sync warnings and refs preserve direct output through RPC', async () => {
  const publicWarning = {
    code: 'item_skipped',
    message: 'One public warning.',
    ref: 'ctx://source-1/item-1',
  }
  const expected = {
    ok: true as const,
    value: {
      mode: 'sync' as const,
      results: [
        {
          sourceId: 'source-1',
          status: 'completed' as const,
          run: {
            ...completedRun,
            warningsCount: 1,
            lastWarning: publicWarning,
            warnings: [publicWarning],
          },
        },
      ],
      warnings: [{ sourceId: 'source-1', ...publicWarning }],
    },
  }
  const app = application({
    syncService: { run: async () => expected.value },
  })
  app.markReady()
  const direct = (
    await consumeApplicationSync(
      app.sync.run({ mode: 'sync' }, context('sync-direct')),
    )
  ).result
  const rpc = (await consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })))
    .result
  expect(direct).toEqual(expected)
  if (!direct.ok) throw new Error('Expected direct sync success')
  expect(rpc).toEqual(direct.value)
})

test('failed sync uses the deterministic public CLI projection through RPC', async () => {
  const app = application({
    syncService: {
      run: async () => ({
        mode: 'sync',
        results: [
          {
            sourceId: 'source-1',
            status: 'failed',
            error: Object.assign(new Error('raw provider body'), {
              code: 'provider_bad_response',
            }),
            diagnostics: {
              warningsCount: 1,
              lastWarning: {
                code: 'item_skipped',
                message: 'One public warning.',
                ref: 'ctx://source-1/item-1',
              },
              errorsCount: 1,
              lastError: 'raw diagnostic must not cross',
            },
          },
        ],
        warnings: [],
      }),
    },
  })
  app.markReady()
  const message = 'Sync failed for Source "source-1" (provider_bad_response)'
  const expected = {
    ok: true as const,
    value: {
      mode: 'sync' as const,
      results: [
        {
          sourceId: 'source-1',
          status: 'failed' as const,
          failure: { code: 'provider_bad_response', message },
          diagnostics: {
            warningsCount: 1,
            lastWarning: {
              code: 'item_skipped',
              message: 'One public warning.',
              ref: 'ctx://source-1/item-1',
            },
            errorsCount: 1 as const,
            lastError: message,
          },
        },
      ],
      warnings: [],
    },
  }
  const direct = (
    await consumeApplicationSync(
      app.sync.run({ mode: 'sync' }, context('failed-direct')),
    )
  ).result
  const rpc = (await consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })))
    .result
  expect(direct).toEqual(expected)
  if (!direct.ok) throw new Error('Expected projected sync success')
  expect(rpc).toEqual(direct.value)
  expect(JSON.stringify(rpc)).not.toMatch(/raw provider body|raw diagnostic/)
})

test('router rejects oversized status rows instead of returning partial success', async () => {
  const app = application({
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () =>
        Array.from({ length: 1_025 }, (_, index) => ({
          ...statusRow,
          sourceId: `source-${index}`,
        })),
    },
  })
  app.markReady()
  const result = await rpcFailure(clientFor(app).status.get({}))
  expect(result).toEqual({
    kind: 'ctxindex',
    taxonomy: 'other',
    code: 'internal_error',
    message: 'The daemon could not complete the request.',
  })
})

test('router rejects oversized sync results instead of returning partial success', async () => {
  const app = application({
    syncService: {
      run: async () => ({
        mode: 'sync',
        results: Array.from({ length: 1_025 }, (_, index) => ({
          sourceId: `source-${index}`,
          status: 'completed' as const,
          run: { ...completedRun, runId: `run-${index}` },
        })),
        warnings: [],
      }),
    },
  })
  app.markReady()
  const result = await rpcFailure(
    consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })),
  )
  expect(result).toMatchObject({ code: 'internal_error' })
})

test('router rejects oversized warning arrays instead of returning partial success', async () => {
  const warnings = Array.from({ length: 257 }, (_, index) => ({
    code: `warning-${index}`,
    message: 'warning',
  }))
  const outputs = [
    {
      mode: 'sync' as const,
      results: [],
      warnings: warnings.map((entry, index) => ({
        ...entry,
        sourceId: `source-${index}`,
      })),
    },
    {
      mode: 'sync' as const,
      results: [
        {
          sourceId: 'source-1',
          status: 'completed' as const,
          run: {
            ...completedRun,
            warningsCount: warnings.length,
            warnings,
          },
        },
      ],
      warnings: [],
    },
  ]
  for (const output of outputs) {
    const app = application({
      syncService: { run: async () => output },
    })
    app.markReady()
    const result = await rpcFailure(
      consumeRpcSync(clientFor(app).sync.run({ mode: 'sync' })),
    )
    expect(result).toMatchObject({ code: 'internal_error' })
  }
})

test('search receives request cancellation and redacts raw provider warning text', async () => {
  let observed: AbortSignal | undefined
  const app = application({
    searchService: {
      search: async ({ signal }: { signal?: AbortSignal }) => {
        observed = signal
        await new Promise<void>((resolve) =>
          signal?.addEventListener('abort', () => resolve(), { once: true }),
        )
        return {
          results: [],
          warnings: [
            {
              sourceId: 'source-1',
              code: 'provider_failure',
              message: 'TOKEN-CANARY /private/provider/body',
            },
          ],
        }
      },
    },
  })
  app.markReady()
  const controller = new AbortController()
  const pending = app.search.query(
    {},
    context('search-cancel', controller.signal),
  )
  await Promise.resolve()
  controller.abort()
  const cancelled = await pending
  expect(observed?.aborted).toBe(true)
  expect(cancelled).toMatchObject({
    ok: false,
    error: { code: 'cancelled' },
  })

  const safe = application({
    searchService: {
      search: async () => ({
        results: [],
        warnings: [
          {
            sourceId: 'source-1',
            code: 'provider_failure',
            message: 'TOKEN-CANARY /private/provider/body',
          },
        ],
      }),
    },
  })
  safe.markReady()
  const result = await safe.search.query({}, context('search-warning'))
  expect(JSON.stringify(result)).not.toContain('TOKEN-CANARY')
  expect(JSON.stringify(result)).not.toContain('/private/provider/body')
  expect(result).toMatchObject({
    ok: true,
    value: {
      warnings: [
        {
          code: 'provider_failure',
          message: 'Search warning for Source "source-1" (provider_failure)',
        },
      ],
    },
  })
})

test('search forwards query-less and resumed exact-Source remote pagination', async () => {
  const inputs: unknown[] = []
  const app = application({
    sourceService: {
      resolveSourceId: (value: string) =>
        value === 'work-outlook' ? '01ARZ3NDEKTSV4RRFFQ69G5FAV' : value,
      getStatus: () => [],
    },
    searchService: {
      search: async (input: unknown) => {
        inputs.push(input)
        return {
          results: [],
          warnings: [],
          pagination:
            inputs.length === 1
              ? {
                  limit: 50,
                  hasMore: true,
                  continuation: 'opaque-next-page',
                }
              : { limit: 50, hasMore: false, continuation: null },
        }
      },
    },
  })
  app.markReady()

  const first = await app.search.query(
    {
      sourceIds: ['work-outlook'],
      kind: 'mail.message',
      limit: 50,
      remote: true,
    },
    context('search-remote-first'),
  )
  expect(first).toMatchObject({
    ok: true,
    value: {
      pagination: {
        limit: 50,
        hasMore: true,
        continuation: 'opaque-next-page',
      },
    },
  })
  expect(inputs[0]).toMatchObject({
    sourceIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    kind: 'mail.message',
    limit: 50,
    remote: true,
  })

  const resumed = await app.search.query(
    {
      sourceIds: ['work-outlook'],
      kind: 'mail.message',
      limit: 50,
      remote: true,
      continuation: 'opaque-next-page',
    },
    context('search-remote-resumed'),
  )
  expect(resumed).toMatchObject({
    ok: true,
    value: {
      pagination: { limit: 50, hasMore: false, continuation: null },
    },
  })
  expect(inputs[1]).toMatchObject({
    sourceIds: ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
    kind: 'mail.message',
    limit: 50,
    remote: true,
    continuation: 'opaque-next-page',
  })
})

test('Source add checks cancellation after asynchronous Grant resolution', async () => {
  let release!: () => void
  let adds = 0
  const grants = new Promise<readonly never[]>((resolve) => {
    release = () =>
      resolve([
        {
          id: 'grant-1',
          provider: 'test',
          scopes: ['read'],
          accountLabel: 'account',
          accountId: 'account-1',
        } as never,
      ])
  })
  const app = application({
    registry: {
      adapters: {
        get: ({ id }: { id: string }) =>
          id === 'test.adapter'
            ? {
                id: 'test.adapter',
                provider: { id: 'test', auth: { kind: 'oauth2' } },
                access: { scopes: ['read'] },
                configSchema: {
                  safeParse: () => ({ success: true, data: {} }),
                },
              }
            : undefined,
        list: () => [
          {
            id: 'test.adapter',
            provider: { id: 'test', auth: { kind: 'oauth2' } },
            access: { scopes: ['read'] },
            configSchema: { safeParse: () => ({ success: true, data: {} }) },
          },
        ],
      },
    } as never,
    authService: { listGrants: () => grants },
    sourceService: {
      resolveSourceId: (value: string) => value,
      getStatus: () => [],
      addSource: () => {
        adds += 1
        return { sourceId: 'source-1', realmId: 'work' }
      },
    },
  })
  app.markReady()
  const controller = new AbortController()
  const pending = app.source.add(
    { adapterId: 'test.adapter', realmSlug: 'work' },
    context('source-add-cancel', controller.signal),
  )
  await Promise.resolve()
  controller.abort()
  release()
  expect(await pending).toMatchObject({
    ok: false,
    error: { code: 'cancelled' },
  })
  expect(adds).toBe(0)
})

test('Action describe and run resolve one Source and preserve cancellation and output', async () => {
  const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
  const actionId = 'example.item.create'
  let described: unknown
  let run: unknown
  const app = application({
    sourceService: {
      resolveSourceId: (source: string) => {
        expect(source).toBe('notes')
        return sourceId
      },
      getStatus: () => [],
    },
    actionService: {
      describe(input: unknown) {
        described = input
        return {
          id: actionId,
          profile: { id: 'example.item', version: 1 },
          effect: 'reversible',
          input: { type: 'object' },
          output: { id: 'example.item', version: 1 },
          adapters: [{ id: 'example.adapter' }],
          sources: [
            {
              id: sourceId,
              adapter: { id: 'example.adapter' },
              available: true,
            },
          ],
        }
      },
      async run(input: {
        actionId: string
        sourceId: string
        actionInput: unknown
        signal: AbortSignal
        confirmIrreversible: boolean
      }) {
        run = input
        return {
          resource: {
            id: 'resource-id',
            ref: `ctx://${sourceId}/item/one`,
            sourceId,
            realmId: 'work',
            profile: { id: 'example.item', version: 1 },
            origin: 'adhoc',
            title: 'One',
            summary: null,
            occurredAt: null,
            providerUpdatedAt: null,
            deletedAt: null,
            hydratedAt: 1,
            payload: { title: 'One' },
            createdAt: 1,
            updatedAt: 1,
          },
          warnings: [],
        }
      },
    },
  })
  app.markReady()
  const request = context('action-request')

  expect(
    await app.action.describe({ actionId, source: 'notes' }, request),
  ).toMatchObject({ ok: true, value: { id: actionId } })
  const result = await app.action.run(
    {
      actionId,
      source: 'notes',
      actionInput: { title: 'One' },
      confirmIrreversible: false,
    },
    request,
  )
  expect(result).toMatchObject({
    ok: true,
    value: { resource: { ref: `ctx://${sourceId}/item/one` }, warnings: [] },
  })
  expect(described).toEqual({ actionId, sourceId })
  expect(run).toMatchObject({
    actionId,
    sourceId,
    actionInput: { title: 'One' },
    confirmIrreversible: false,
  })
  expect((run as { signal: unknown }).signal).toBeInstanceOf(AbortSignal)
})

test('export prepares one bounded transfer without exposing bytes in RPC', async () => {
  const ref = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/one'
  let exportInput: unknown
  let retained: Uint8Array | undefined
  const app = application({
    exportService: {
      async prepare(input: unknown) {
        exportInput = input
        return {
          bytes: Uint8Array.of(0, 255, 1),
          mediaType: 'application/octet-stream',
          format: 'binary',
          ref,
          warnings: [],
        }
      },
    },
    transferStore: {
      create(bytes: Uint8Array) {
        retained = bytes
        return { ticket: 'a'.repeat(64), byteSize: 3, expiresAt: 1_000 }
      },
    },
  })
  app.markReady()
  const result = await app.export.prepare(
    { ref, format: 'binary' },
    context('export-request'),
  )

  expect(result).toEqual({
    ok: true,
    value: {
      transfer: { ticket: 'a'.repeat(64), byteSize: 3, expiresAt: 1_000 },
      mediaType: 'application/octet-stream',
      format: 'binary',
      ref,
      warnings: [],
    },
  })
  expect(result).not.toHaveProperty('value.bytes')
  expect(retained).toEqual(Uint8Array.of(0, 255, 1))
  expect(exportInput).toMatchObject({
    ref,
    format: 'binary',
    signal: expect.any(AbortSignal),
  })
})
