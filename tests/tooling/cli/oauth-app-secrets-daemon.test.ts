import { Database } from 'bun:sqlite'
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test'
import { chmod, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { resetEnvForTests } from '@ctxindex/core/config'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { CtxindexSecretsError } from '@ctxindex/core/secrets'
import { googleOAuthProvider } from '@ctxindex/official'
import type { RpcOAuthAppAddInput } from '@ctxindex/rpc'
import {
  CLI_DAEMON_PROTOCOL,
  daemonHealth,
  selectDaemon,
} from '../../../apps/cli/src/daemon/client'
import { runCli } from '../../../apps/cli/src/main'
import {
  DaemonApplication,
  type DaemonOAuthAppService,
} from '../../../apps/daemon/src/application'
import { validateDaemonOAuthAppConfig } from '../../../apps/daemon/src/runtime'
import { ByteTransferStore } from '../../../apps/daemon/src/transfer'
import { bindDaemonTransport } from '../../../apps/daemon/src/transport'

// Acceptance for the dedicated write-only sensitive OAuth App input and the
// daemon-owned secret backend commands, exercised through the public CLI and
// the real owner-private daemon transport in one process. Every console
// surface (CLI and daemon) and every file under the runtime roots is scanned
// for the injected canaries.

const canary = 'oauth-app-secret-canary-7f3a'
const unrelatedCanary = 'unrelated-environment-canary-91c2'
const invalidConfig =
  'OAuth App configuration is invalid for the selected Provider'

let previous: NodeJS.ProcessEnv
let root: string
let output: string[]

beforeEach(async () => {
  previous = { ...process.env }
  root = await mkdtemp('/tmp/ctxi-oauth-secrets-')
  for (const kind of ['CONFIG', 'DATA', 'STATE', 'CACHE']) {
    process.env[`CTXINDEX_${kind}_HOME`] = join(root, kind.toLowerCase())
  }
  process.env.NODE_ENV = 'test'
  process.env.CTXINDEX_KEYTAR_MOCK_FILE = join(root, 'keytar.json')
  delete process.env.CTXINDEX_DAEMON_TEST_ENDPOINT
  delete process.env.CTXINDEX_GOOGLE_CLIENT_ID
  delete process.env.CTXINDEX_GOOGLE_CLIENT_SECRET
  output = []
  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '))
    })
  }
})

afterEach(async () => {
  process.exitCode = 0
  for (const method of ['log', 'error', 'warn', 'info', 'debug'] as const) {
    spyOn(console, method).mockRestore()
  }
  for (const key of Object.keys(process.env)) {
    if (!(key in previous)) delete process.env[key]
  }
  Object.assign(process.env, previous)
  resetEnvForTests()
  await rm(root, { recursive: true, force: true })
})

async function filesContaining(needle: string): Promise<string[]> {
  const matches: string[] = []
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    try {
      if ((await readFile(path)).includes(needle)) matches.push(path)
    } catch {}
  }
  return matches
}

// The CLI memoizes its environment, so each invocation re-reads the variables
// a test has just set.
function cli(args: string[]): Promise<number> {
  resetEnvForTests()
  return runCli(args)
}

function expectNoCanary() {
  const printed = output.join('\n')
  expect(printed).not.toContain(canary)
  expect(printed).not.toContain(unrelatedCanary)
}

type Application = ConstructorParameters<typeof DaemonApplication>[0]

// Binds a real daemon transport over the CLI-selected test endpoint. The
// database is made unreadable first, so any client-side SQLite open would
// fail the command instead of silently bypassing the daemon.
async function boundDaemon(
  services: Partial<Application> = {},
  wrap: (application: DaemonApplication) => DaemonApplication = (application) =>
    application,
) {
  expect(await cli(['init'])).toBe(0)
  const databasePath = join(root, 'data', 'ctxindex.sqlite')
  await chmod(databasePath, 0o000)
  expect(() => new Database(databasePath)).toThrow()
  process.env.CTXINDEX_DAEMON_TEST_ENDPOINT = join(root, 'daemon.sock')
  const selection = selectDaemon()
  if (!selection) throw new Error('Expected the selected test endpoint')
  const application = new DaemonApplication({
    protocol: CLI_DAEMON_PROTOCOL,
    runtime: selection.roots.identity,
    daemonVersion: '0.0.0',
    buildVersion: 'test',
    instanceId: 'oauth-secrets-test',
    startedAt: '2026-07-18T00:00:00.000Z',
    pid: process.pid,
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
    ...services,
  })
  application.markReady()
  const listener = bindDaemonTransport({
    endpoint: selection.endpoint,
    application: wrap(application),
    expectations: {
      protocol: CLI_DAEMON_PROTOCOL,
      runtime: selection.roots.identity,
    },
    transferStore: new ByteTransferStore(),
  })
  await daemonHealth(selection)
  output.length = 0
  return { application, listener }
}

// Mirrors the daemon service contract: validate the exact Provider mapping,
// then consume it once into the (recorded) secret backend.
function recordingOAuthAppService() {
  const delegated: RpcOAuthAppAddInput[] = []
  const persisted: RpcOAuthAppAddInput[] = []
  const service: DaemonOAuthAppService = {
    registration: () => googleOAuthProvider.auth.registration.environment,
    add: async (input) => {
      delegated.push(input)
      validateDaemonOAuthAppConfig(googleOAuthProvider, input.config)
      persisted.push(input)
    },
    list: () =>
      persisted.map((input) => ({
        providerId: input.provider,
        label: input.label,
        origin: 'local' as const,
        provenance: { kind: 'local' as const },
      })),
    remove: async () => {},
  }
  return { service, delegated, persisted }
}

test('oauth-app add consumes the exact Provider mapping once and never reflects it', async () => {
  const apps = recordingOAuthAppService()
  const daemon = await boundDaemon({ oauthAppService: apps.service })
  try {
    process.env.CTXINDEX_GOOGLE_CLIENT_ID = 'public-client-id'
    process.env.CTXINDEX_GOOGLE_CLIENT_SECRET = canary
    process.env.CTXINDEX_UNRELATED_SECRET = unrelatedCanary

    expect(
      await cli(['oauth-app', 'add', 'google', 'desktop', '--from-env']),
    ).toBe(0)
    expect(await cli(['oauth-app', 'list', '--format', 'json'])).toBe(0)

    expect(apps.delegated).toEqual([
      {
        provider: 'google',
        label: 'desktop',
        config: { clientId: 'public-client-id', clientSecret: canary },
      },
    ])
    expect(apps.persisted).toHaveLength(1)
    expect(output.join('\n')).toContain('OAuth App added: google "desktop"')
    expectNoCanary()
    expect(await filesContaining(canary)).toEqual([])
  } finally {
    await daemon.listener.stop()
  }
})

test('malformed sensitive input fails as validation with zero side effects', async () => {
  const apps = recordingOAuthAppService()
  const daemon = await boundDaemon({ oauthAppService: apps.service })
  try {
    const malformed: Record<string, string | undefined>[] = [
      // Rejected by the bounded RPC input before any delegation.
      { id: 'public-client-id', secret: `${canary}\u0007` },
      { id: 'public-client-id', secret: `${canary}${'x'.repeat(16_385)}` },
      // Rejected by the daemon's Provider validation before persistence.
      { id: undefined, secret: canary },
    ]
    for (const values of malformed) {
      if (values.id === undefined) delete process.env.CTXINDEX_GOOGLE_CLIENT_ID
      else process.env.CTXINDEX_GOOGLE_CLIENT_ID = values.id
      process.env.CTXINDEX_GOOGLE_CLIENT_SECRET = values.secret
      output.length = 0

      expect(
        await cli(['oauth-app', 'add', 'google', 'desktop', '--from-env']),
      ).toBe(2)
      expect(output).toEqual([invalidConfig])
    }

    expect(apps.delegated.map((input) => input.config.clientId)).toEqual([
      undefined,
    ])
    expect(apps.persisted).toEqual([])
    expectNoCanary()
    expect(await filesContaining(canary)).toEqual([])
  } finally {
    await daemon.listener.stop()
  }
})

test('a declared daemon unavailability is never replayed with the sensitive input', async () => {
  const apps = recordingOAuthAppService()
  let attempts = 0
  const daemon = await boundDaemon(
    { oauthAppService: apps.service },
    (application) =>
      ({
        ...application,
        oauthApp: {
          ...application.oauthApp,
          add: async () => {
            attempts += 1
            return {
              ok: false,
              error: {
                kind: 'daemon_unavailable',
                code: 'daemon_unavailable',
                message:
                  'The daemon is stopping and is not accepting new work.',
              },
            }
          },
        },
      }) as unknown as DaemonApplication,
  )
  try {
    process.env.CTXINDEX_GOOGLE_CLIENT_ID = 'public-client-id'
    process.env.CTXINDEX_GOOGLE_CLIENT_SECRET = canary

    expect(
      await cli(['oauth-app', 'add', 'google', 'desktop', '--from-env']),
    ).toBe(50)
    expect(attempts).toBe(1)
    expect(apps.delegated).toEqual([])
    expectNoCanary()
  } finally {
    await daemon.listener.stop()
  }
})

test('a cancelled OAuth App add is not delegated', async () => {
  const apps = recordingOAuthAppService()
  const daemon = await boundDaemon({ oauthAppService: apps.service })
  try {
    const controller = new AbortController()
    controller.abort()
    const result = await daemon.application.oauthApp.add(
      {
        provider: 'google',
        label: 'desktop',
        config: { clientId: 'public-client-id', clientSecret: canary },
      },
      {
        requestId: 'cancelled-add',
        signal: controller.signal,
        clientProtocol: CLI_DAEMON_PROTOCOL,
        clientRuntime: daemon.application.runtime,
      },
    )
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The request was cancelled.',
      },
    })
    expect(apps.delegated).toEqual([])
  } finally {
    await daemon.listener.stop()
  }
})

test('secret status and backend switching expose neither values nor backend-native errors', async () => {
  let failure: Error | undefined
  const daemon = await boundDaemon({
    secretBackendManager: {
      async getStatus() {
        if (failure) throw failure
        return {
          backend: 'keychain' as const,
          backends: {
            file: { available: true, referenceCount: 0 },
            keychain: { available: true, referenceCount: 2 },
          },
        }
      },
      async switchBackend(target: 'keychain' | 'file') {
        if (failure) throw failure
        return {
          backend: target,
          copied: 2,
          cleaned: 1,
          cleanupPending: true,
          warnings: [`keychain:ctxindex/google ${canary}`],
        }
      },
    },
  })
  try {
    expect(await cli(['secrets', 'status', '--format', 'json'])).toBe(0)
    expect(JSON.parse(output.at(-1) ?? '')).toMatchObject({
      backend: 'keychain',
    })
    expect(await cli(['secrets', 'backend', 'set', 'file'])).toBe(0)
    expect(output.at(-1)).toBe(
      'warning: Secret backend cleanup remains pending.',
    )

    failure = new CtxindexSecretsError(
      `keytar: could not decrypt ${canary}`,
      'decrypt_failed',
    )
    output.length = 0
    expect(await cli(['secrets', 'status'])).not.toBe(0)
    expect(output).toEqual([
      'The configured secret backend could not decrypt its data.',
    ])
    failure = new Error(`native keychain error ${canary}`)
    output.length = 0
    expect(await cli(['secrets', 'backend', 'set', 'keychain'])).not.toBe(0)
    expect(output).toEqual(['The daemon could not complete the request.'])

    expectNoCanary()
    expect(await filesContaining(canary)).toEqual([])
  } finally {
    await daemon.listener.stop()
  }
})
