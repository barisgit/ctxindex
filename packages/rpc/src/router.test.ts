import { describe, expect, expectTypeOf, test } from 'bun:test'
import { createRouterClient, type RouterClient } from '@orpc/server'
import type {
  DaemonClient,
  DaemonRouter,
  DaemonRpcApplication,
  RpcRequestContext,
} from './router'
import { createDaemonRouter } from './router'

const digest = 'a'.repeat(64)
const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ref = `ctx://${sourceId}/item/one`
const protocol = { id: 'ctxindex.local', version: 1 } as const
const runtime = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
} as const

function createContext(
  overrides: Partial<RpcRequestContext> = {},
): RpcRequestContext {
  return {
    requestId: 'request-id',
    signal: new AbortController().signal,
    clientProtocol: protocol,
    clientRuntime: runtime,
    ...overrides,
  }
}

function createApplication() {
  const calls = {
    health: 0,
    realmAdd: 0,
    realmList: 0,
    sourceAdd: 0,
    sourceDefinitions: 0,
    sourceList: 0,
    sourceRemove: 0,
    sync: 0,
    status: 0,
    search: 0,
    resourceGet: 0,
    threadGet: 0,
    shutdown: 0,
  }
  const contexts: RpcRequestContext[] = []
  const application: DaemonRpcApplication = {
    async health(_input, context) {
      calls.health += 1
      contexts.push(context)
      return {
        ok: true,
        value: {
          protocol,
          runtime,
          daemonVersion: '0.0.0',
          buildVersion: 'dev',
          instanceId: 'instance',
          pid: 123,
          startedAt: '2026-07-18T12:00:00Z',
          lifecycle: 'ready',
          ready: true,
          extensionDiagnosticsCount: 0,
          activeRequestCount: 0,
        },
      }
    },
    async sync(_input, context) {
      calls.sync += 1
      contexts.push(context)
      return {
        ok: true,
        value: { mode: 'sync', results: [], warnings: [] },
      }
    },
    async realmAdd(_input, context) {
      calls.realmAdd += 1
      contexts.push(context)
      return { ok: true, value: { realmId: 'work' } }
    },
    async realmList(_input, context) {
      calls.realmList += 1
      contexts.push(context)
      return { ok: true, value: { rows: [] } }
    },
    async sourceAdd(_input, context) {
      calls.sourceAdd += 1
      contexts.push(context)
      return { ok: true, value: { sourceId: 'source', realmId: 'work' } }
    },
    async sourceDefinitions(_input, context) {
      calls.sourceDefinitions += 1
      contexts.push(context)
      return { ok: true, value: { rows: [] } }
    },
    async sourceList(_input, context) {
      calls.sourceList += 1
      contexts.push(context)
      return { ok: true, value: { rows: [] } }
    },
    async sourceRemove(_input, context) {
      calls.sourceRemove += 1
      contexts.push(context)
      return { ok: true, value: { sourceId: 'source' } }
    },
    async status(_input, context) {
      calls.status += 1
      contexts.push(context)
      return { ok: true, value: { rows: [] } }
    },
    async search(_input, context) {
      calls.search += 1
      contexts.push(context)
      return { ok: true, value: { results: [], warnings: [] } }
    },
    async resourceGet(_input, context) {
      calls.resourceGet += 1
      contexts.push(context)
      return {
        ok: true,
        value: {
          resource: {
            id: 'resource-id',
            ref,
            sourceId,
            realmId: 'work',
            profile: { id: 'example.item', version: 1 },
            origin: 'synced',
            title: 'One',
            summary: null,
            occurredAt: null,
            providerUpdatedAt: null,
            deletedAt: null,
            hydratedAt: 1,
            payload: { body: 'safe' },
            createdAt: 1,
            updatedAt: 1,
          },
          warnings: [],
        },
      }
    },
    async threadGet(_input, context) {
      calls.threadGet += 1
      contexts.push(context)
      return { ok: true, value: { mode: 'flat', messages: [], warnings: [] } }
    },
    async shutdown(_input, context) {
      calls.shutdown += 1
      contexts.push(context)
      return {
        ok: true,
        value: {
          status: 'accepted',
          instanceId: 'instance',
          acceptedAt: '2026-07-18T12:00:00Z',
          alreadyStopping: false,
          observationTimeoutMs: 1_000,
        },
      }
    },
  }
  return { application, calls, contexts }
}

function clientFor(
  application: DaemonRpcApplication,
  context: RpcRequestContext,
) {
  return createRouterClient(
    createDaemonRouter(application, { protocol, runtime }),
    {
      context,
    },
  )
}

describe('daemon router composition', () => {
  test('delegates each procedure exactly once without a hidden health call', async () => {
    const fixture = createApplication()
    const client = clientFor(fixture.application, createContext())

    await client.system.health({})
    await client.realm.add({ slug: 'work' })
    await client.realm.list({})
    await client.source.add({ adapterId: 'local.directory' })
    await client.source.definitions({})
    await client.source.list({})
    await client.source.remove({ source: 'source' })
    await client.sync.run({ mode: 'sync' })
    await client.status.get({})
    await client.search.query({ text: 'query' })
    await client.resource.get({ ref })
    await client.thread.get({ ref })
    await client.system.shutdown({})

    expect(fixture.calls).toEqual({
      health: 1,
      realmAdd: 1,
      realmList: 1,
      sourceAdd: 1,
      sourceDefinitions: 1,
      sourceList: 1,
      sourceRemove: 1,
      sync: 1,
      status: 1,
      search: 1,
      resourceGet: 1,
      threadGet: 1,
      shutdown: 1,
    })
  })

  test('blocks every application method on protocol/runtime mismatch', async () => {
    const protocolFixture = createApplication()
    const protocolClient = clientFor(
      protocolFixture.application,
      createContext({ clientProtocol: { ...protocol, version: 2 } }),
    )
    const protocolResults = await Promise.all([
      protocolClient.system.health({}),
      protocolClient.realm.add({ slug: 'work' }),
      protocolClient.realm.list({}),
      protocolClient.source.add({ adapterId: 'local.directory' }),
      protocolClient.source.definitions({}),
      protocolClient.source.list({}),
      protocolClient.source.remove({ source: 'source' }),
      protocolClient.sync.run({ mode: 'sync' }),
      protocolClient.status.get({}),
      protocolClient.search.query({ text: 'query' }),
      protocolClient.resource.get({ ref }),
      protocolClient.thread.get({ ref }),
      protocolClient.system.shutdown({}),
    ])
    expect(
      protocolResults.every(
        (result) => !result.ok && result.error.kind === 'protocol_incompatible',
      ),
    ).toBe(true)
    expect(protocolFixture.calls).toEqual({
      health: 0,
      realmAdd: 0,
      realmList: 0,
      sourceAdd: 0,
      sourceDefinitions: 0,
      sourceList: 0,
      sourceRemove: 0,
      sync: 0,
      status: 0,
      search: 0,
      resourceGet: 0,
      threadGet: 0,
      shutdown: 0,
    })

    const runtimeFixture = createApplication()
    const runtimeClient = clientFor(
      runtimeFixture.application,
      createContext({
        clientRuntime: { ...runtime, databaseDigest: 'b'.repeat(64) },
      }),
    )
    const runtimeResults = await Promise.all([
      runtimeClient.system.health({}),
      runtimeClient.realm.add({ slug: 'work' }),
      runtimeClient.realm.list({}),
      runtimeClient.source.add({ adapterId: 'local.directory' }),
      runtimeClient.source.definitions({}),
      runtimeClient.source.list({}),
      runtimeClient.source.remove({ source: 'source' }),
      runtimeClient.sync.run({ mode: 'sync' }),
      runtimeClient.status.get({}),
      runtimeClient.search.query({ text: 'query' }),
      runtimeClient.resource.get({ ref }),
      runtimeClient.thread.get({ ref }),
      runtimeClient.system.shutdown({}),
    ])
    expect(
      runtimeResults.every(
        (result) =>
          !result.ok && result.error.kind === 'runtime_identity_mismatch',
      ),
    ).toBe(true)
    expect(runtimeFixture.calls).toEqual({
      health: 0,
      realmAdd: 0,
      realmList: 0,
      sourceAdd: 0,
      sourceDefinitions: 0,
      sourceList: 0,
      sourceRemove: 0,
      sync: 0,
      status: 0,
      search: 0,
      resourceGet: 0,
      threadGet: 0,
      shutdown: 0,
    })
  })

  test('reports a bounded presented protocol ID mismatch without delegation', async () => {
    const fixture = createApplication()
    const client = clientFor(
      fixture.application,
      createContext({
        clientProtocol: { id: 'another.local.protocol', version: 1 },
      }),
    )

    const result = await client.system.health({})

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'protocol_incompatible',
        code: 'protocol_incompatible',
        message: 'The client protocol is incompatible with this daemon.',
        clientProtocol: { id: 'another.local.protocol', version: 1 },
        daemonProtocol: protocol,
      },
    })
    expect(fixture.calls).toEqual({
      health: 0,
      realmAdd: 0,
      realmList: 0,
      sourceAdd: 0,
      sourceDefinitions: 0,
      sourceList: 0,
      sourceRemove: 0,
      sync: 0,
      status: 0,
      search: 0,
      resourceGet: 0,
      threadGet: 0,
      shutdown: 0,
    })
  })

  test('captures immutable compatibility expectations at construction', async () => {
    const fixture = createApplication()
    const expectations = { protocol: { ...protocol }, runtime: { ...runtime } }
    const router = createDaemonRouter(fixture.application, expectations)
    ;(expectations.protocol as { version: number }).version = 2
    ;(expectations.runtime as { tupleDigest: string }).tupleDigest = 'b'.repeat(
      64,
    )

    const client = createRouterClient(router, { context: createContext() })
    expect((await client.system.health({})).ok).toBe(true)
    expect(fixture.calls.health).toBe(1)
  })

  test('forwards each request AbortSignal unchanged through one application delegation', async () => {
    const fixture = createApplication()
    const controller = new AbortController()
    const context = createContext({ signal: controller.signal })
    const client = clientFor(fixture.application, context)

    await client.search.query({ text: 'query' })
    await client.resource.get({ ref })
    await client.thread.get({ ref })

    expect(fixture.contexts).toHaveLength(3)
    for (const forwarded of fixture.contexts) {
      expect(forwarded.signal).toBe(controller.signal)
      expect(forwarded.requestId).toBe('request-id')
      expect(forwarded.clientProtocol).toEqual(protocol)
      expect(forwarded.clientRuntime).toEqual(runtime)
    }
    expect(fixture.calls.search).toBe(1)
    expect(fixture.calls.resourceGet).toBe(1)
    expect(fixture.calls.threadGet).toBe(1)
  })

  test('validates output and replaces thrown or unsafe application results', async () => {
    const fixture = createApplication()
    fixture.application.sync = async () => {
      throw new Error('secret-canary /private/db.sqlite provider-body')
    }
    const thrown = await clientFor(
      fixture.application,
      createContext(),
    ).sync.run({
      mode: 'sync',
    })
    expect(thrown).toEqual({
      ok: false,
      error: {
        kind: 'ctxindex',
        taxonomy: 'other',
        code: 'internal_error',
        message: 'The daemon could not complete the request.',
      },
    })
    expect(JSON.stringify(thrown)).not.toContain('secret-canary')

    fixture.application.sync = async () =>
      ({
        ok: true,
        value: {
          mode: 'sync',
          results: [
            {
              sourceId: 'source',
              status: 'failed',
              failure: {
                code: 'provider_error',
                message: 'safe',
                cause: new Error('secret-canary'),
                stack: 'raw stack',
                diagnostics: { path: '/private/db.sqlite' },
                backendBody: 'provider-body',
                token: 'secret-token',
              },
              diagnostics: {
                warningsCount: 0,
                lastWarning: null,
                errorsCount: 1,
                lastError: 'safe',
              },
            },
          ],
          warnings: [],
        },
      }) as never
    const unsafe = await clientFor(
      fixture.application,
      createContext(),
    ).sync.run({
      mode: 'sync',
    })
    expect(unsafe).toEqual(thrown)
    expect(JSON.stringify(unsafe)).not.toMatch(
      /secret-canary|raw stack|private|provider-body|token/,
    )
  })

  test('preserves an application-projected result_too_large failure', async () => {
    const fixture = createApplication()
    fixture.application.resourceGet = async () => ({
      ok: false,
      error: {
        kind: 'result_too_large',
        code: 'result_too_large',
        message: 'The result exceeds the local RPC response bounds.',
      },
    })

    expect(
      await clientFor(fixture.application, createContext()).resource.get({
        ref,
      }),
    ).toEqual({
      ok: false,
      error: {
        kind: 'result_too_large',
        code: 'result_too_large',
        message: 'The result exceeds the local RPC response bounds.',
      },
    })
  })

  test('exports an inferred client type for the router', () => {
    expectTypeOf<DaemonClient>().toEqualTypeOf<RouterClient<DaemonRouter>>()
    const input: Parameters<DaemonClient['sync']['run']>[0] = { mode: 'sync' }
    expectTypeOf(input.mode).toEqualTypeOf<'sync' | 'resync' | 'diff'>()
    const sourceInput: Parameters<DaemonClient['source']['add']>[0] = {
      adapterId: 'adapter',
      searchRouting: 'hybrid',
    }
    expectTypeOf(sourceInput.searchRouting).toEqualTypeOf<
      'indexed' | 'federated' | 'hybrid' | undefined
    >()
    const searchInput: Parameters<DaemonClient['search']['query']>[0] = {
      text: 'query',
      localOnly: true,
    }
    expectTypeOf(searchInput.text).toEqualTypeOf<string | undefined>()
    expectTypeOf<DaemonClient['resource']['get']>().toBeFunction()
    expectTypeOf<DaemonClient['thread']['get']>().toBeFunction()
  })
})
