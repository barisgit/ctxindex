import { describe, expect, expectTypeOf, test } from 'bun:test'
import {
  getContractRouter,
  type InferContractRouterErrorMap,
  type InferContractRouterInputs,
  type InferContractRouterOutputs,
  type ORPCErrorFromErrorMap,
} from '@orpc/contract'
import { createRouterClient, ORPCError } from '@orpc/server'
import { daemonContract } from './contract'
import type {
  DaemonRpcApplication,
  RpcRequestContext,
  RpcTransportContext,
} from './router'
import { createDaemonRouter } from './router'
import {
  type RpcFailure,
  type RpcResult,
  type RpcSyncEvent,
  type RpcSyncResult,
  rpcFailureRegistry,
} from './schemas'

const digest = 'a'.repeat(64)
const sourceId = '01ARZ3NDEKTSV4RRFFQ69G5FAV'
const ref = `ctx://${sourceId}/item/one`
const resource = {
  id: 'resource-id',
  ref,
  sourceId,
  realmId: 'work',
  profile: { id: 'example.item', version: 1 },
  origin: 'synced' as const,
  title: 'One',
  summary: null,
  occurredAt: null,
  providerUpdatedAt: null,
  deletedAt: null,
  hydratedAt: 1,
  payload: { body: 'safe' },
  createdAt: 1,
  updatedAt: 1,
}
const protocol = { id: 'ctxindex.local', version: 2 } as const
const runtime = {
  tupleDigest: digest,
  configDigest: digest,
  dataDigest: digest,
  stateDigest: digest,
  cacheDigest: digest,
  databaseDigest: digest,
} as const
const rpcErrorMessage = rpcFailureRegistry.ctxindex.message

async function* syncStream(
  events: readonly RpcSyncEvent[] = [],
  terminal: RpcResult<RpcSyncResult> = {
    ok: true,
    value: { mode: 'sync', results: [], warnings: [] },
  },
): AsyncGenerator<RpcSyncEvent, RpcResult<RpcSyncResult>, void> {
  for (const event of events) yield event
  return terminal
}

function transportContext(
  overrides: Partial<RpcTransportContext> = {},
): RpcTransportContext {
  return {
    requestId: 'request-id',
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
    secretsStatus: 0,
    secretsBackendSet: 0,
    documentationList: 0,
    documentationGet: 0,
    documentationSearch: 0,
    sourceAdd: 0,
    sourceDefinitions: 0,
    sourceList: 0,
    sourceRemove: 0,
    sync: 0,
    status: 0,
    search: 0,
    resourceGet: 0,
    threadGet: 0,
    actionDescribe: 0,
    actionRun: 0,
    shutdown: 0,
  }
  const contexts: RpcRequestContext[] = []
  const record = (name: keyof typeof calls, context: RpcRequestContext) => {
    calls[name] += 1
    contexts.push(context)
  }
  const application: DaemonRpcApplication = {
    system: {
      async health(_input, context) {
        record('health', context)
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
      async shutdown(_input, context) {
        record('shutdown', context)
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
    },
    realm: {
      async add(_input, context) {
        record('realmAdd', context)
        return { ok: true, value: { realmId: 'work' } }
      },
      async list(_input, context) {
        record('realmList', context)
        return { ok: true, value: { rows: [] } }
      },
    },
    secrets: {
      async status(_input, context) {
        record('secretsStatus', context)
        return {
          ok: true,
          value: {
            backend: 'file',
            backends: {
              file: { available: true, referenceCount: 2 },
              keychain: { available: false, referenceCount: 1 },
            },
          },
        }
      },
      backend: {
        async set(input, context) {
          record('secretsBackendSet', context)
          return {
            ok: true,
            value: {
              backend: input.target,
              copied: 2,
              cleaned: 2,
              cleanupPending: false,
              warnings: [],
            },
          }
        },
      },
    },
    documentation: {
      async list(_input, context) {
        record('documentationList', context)
        return { ok: true, value: { rows: [] } }
      },
      async get(_input, context) {
        record('documentationGet', context)
        return {
          ok: true,
          value: {
            item: {
              extensionId: 'fixture.docs',
              path: 'README.md',
              kind: 'markdown',
              mediaType: 'text/markdown',
              byteSize: 9,
              content: '# Fixture',
            },
          },
        }
      },
      async search(_input, context) {
        record('documentationSearch', context)
        return { ok: true, value: { rows: [] } }
      },
    },
    source: {
      async add(_input, context) {
        record('sourceAdd', context)
        return { ok: true, value: { sourceId: 'source', realmId: 'work' } }
      },
      async definitions(_input, context) {
        record('sourceDefinitions', context)
        return { ok: true, value: { rows: [] } }
      },
      async list(_input, context) {
        record('sourceList', context)
        return { ok: true, value: { rows: [] } }
      },
      async remove(_input, context) {
        record('sourceRemove', context)
        return { ok: true, value: { sourceId: 'source' } }
      },
    },
    sync: {
      async run(_input, context) {
        record('sync', context)
        return { ok: true, value: syncStream() }
      },
    },
    status: {
      async get(_input, context) {
        record('status', context)
        return { ok: true, value: { rows: [] } }
      },
    },
    search: {
      async query(_input, context) {
        record('search', context)
        return { ok: true, value: { results: [], warnings: [] } }
      },
    },
    resource: {
      async get(_input, context) {
        record('resourceGet', context)
        return {
          ok: true,
          value: {
            resource,
            warnings: [],
          },
        }
      },
    },
    thread: {
      async get(_input, context) {
        record('threadGet', context)
        return { ok: true, value: { mode: 'flat', messages: [], warnings: [] } }
      },
    },
    action: {
      async describe(_input, context) {
        record('actionDescribe', context)
        return {
          ok: true,
          value: {
            id: 'example.item.create',
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
          },
        }
      },
      async run(_input, context) {
        record('actionRun', context)
        return { ok: true, value: { resource, warnings: [] } }
      },
    },
  }
  return { application, calls, contexts }
}

function clientFor(
  application: DaemonRpcApplication,
  context: RpcTransportContext = transportContext(),
) {
  return createRouterClient(
    createDaemonRouter(application, { protocol, runtime }),
    { context },
  )
}

async function captureError(invoke: () => Promise<unknown>) {
  try {
    await invoke()
    throw new Error('Expected RPC error')
  } catch (error) {
    expect(error).toBeInstanceOf(ORPCError)
    return error as ORPCError<string, RpcFailure>
  }
}

describe('pure daemon contract', () => {
  test('owns every exact procedure path independently of handlers', () => {
    const paths = [
      ['system', 'health'],
      ['system', 'shutdown'],
      ['realm', 'add'],
      ['realm', 'list'],
      ['secrets', 'status'],
      ['secrets', 'backend', 'set'],
      ['documentation', 'list'],
      ['documentation', 'get'],
      ['documentation', 'search'],
      ['source', 'definitions'],
      ['source', 'add'],
      ['source', 'list'],
      ['source', 'remove'],
      ['sync', 'run'],
      ['status', 'get'],
      ['search', 'query'],
      ['resource', 'get'],
      ['thread', 'get'],
      ['action', 'describe'],
      ['action', 'run'],
    ] as const
    for (const path of paths) {
      expect(getContractRouter(daemonContract, path)).toBeDefined()
    }
    expect(
      getContractRouter(daemonContract, ['command', 'execute']),
    ).toBeUndefined()
  })

  test('infers a typed sync iterator and plain unary success outputs', () => {
    type Outputs = InferContractRouterOutputs<typeof daemonContract>
    expectTypeOf<Outputs['sync']['run']>().toExtend<
      AsyncIterator<RpcSyncEvent, RpcSyncResult, void>
    >()
    expectTypeOf<Outputs['system']['health']>().not.toHaveProperty('ok')
  })

  test('derives the exact nested application tree from contract inputs and outputs', () => {
    type Inputs = InferContractRouterInputs<typeof daemonContract>
    type Outputs = InferContractRouterOutputs<typeof daemonContract>
    expectTypeOf<
      Parameters<DaemonRpcApplication['system']['health']>[0]
    >().toEqualTypeOf<Inputs['system']['health']>()
    expectTypeOf<
      Awaited<ReturnType<DaemonRpcApplication['system']['health']>>
    >().toEqualTypeOf<
      | { readonly ok: true; readonly value: Outputs['system']['health'] }
      | { readonly ok: false; readonly error: RpcFailure }
    >()
    expectTypeOf<DaemonRpcApplication['system']>().toHaveProperty('shutdown')
    expectTypeOf<DaemonRpcApplication['realm']>().toHaveProperty('add')
    expectTypeOf<DaemonRpcApplication['realm']>().toHaveProperty('list')
    expectTypeOf<DaemonRpcApplication['secrets']>().toHaveProperty('status')
    expectTypeOf<DaemonRpcApplication['secrets']['backend']>().toHaveProperty(
      'set',
    )
    expectTypeOf<DaemonRpcApplication['documentation']>().toHaveProperty('list')
    expectTypeOf<DaemonRpcApplication['documentation']>().toHaveProperty('get')
    expectTypeOf<DaemonRpcApplication['documentation']>().toHaveProperty(
      'search',
    )
    expectTypeOf<DaemonRpcApplication['source']>().toHaveProperty('definitions')
    expectTypeOf<DaemonRpcApplication['source']>().toHaveProperty('add')
    expectTypeOf<DaemonRpcApplication['source']>().toHaveProperty('list')
    expectTypeOf<DaemonRpcApplication['source']>().toHaveProperty('remove')
    expectTypeOf<DaemonRpcApplication['sync']>().toHaveProperty('run')
    type SyncApplicationValue = Extract<
      Awaited<ReturnType<DaemonRpcApplication['sync']['run']>>,
      { readonly ok: true }
    >['value']
    expectTypeOf<SyncApplicationValue>().toExtend<
      AsyncIterator<RpcSyncEvent, RpcResult<RpcSyncResult>, void>
    >()
    expectTypeOf<DaemonRpcApplication['status']>().toHaveProperty('get')
    expectTypeOf<DaemonRpcApplication['search']>().toHaveProperty('query')
    expectTypeOf<DaemonRpcApplication['resource']>().toHaveProperty('get')
    expectTypeOf<DaemonRpcApplication['thread']>().toHaveProperty('get')
    expectTypeOf<DaemonRpcApplication['action']>().toHaveProperty('describe')
    expectTypeOf<DaemonRpcApplication['action']>().toHaveProperty('run')
  })

  test('infers every declared bounded failure variant', () => {
    type ErrorMap = InferContractRouterErrorMap<typeof daemonContract>
    type DeclaredError = ORPCErrorFromErrorMap<ErrorMap>
    expectTypeOf<DeclaredError['data']>().toEqualTypeOf<RpcFailure>()
    expectTypeOf<DeclaredError['code']>().toEqualTypeOf<RpcFailure['kind']>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'ctxindex' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'ctxindex' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'daemon_unavailable' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'daemon_unavailable' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'protocol_incompatible' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'protocol_incompatible' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'runtime_identity_mismatch' }>['data']
    >().toEqualTypeOf<
      Extract<RpcFailure, { kind: 'runtime_identity_mismatch' }>
    >()
    expectTypeOf<
      Extract<DeclaredError, { code: 'database_lease_conflict' }>['data']
    >().toEqualTypeOf<
      Extract<RpcFailure, { kind: 'database_lease_conflict' }>
    >()
    expectTypeOf<
      Extract<DeclaredError, { code: 'prototype_unsupported' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'prototype_unsupported' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'shutdown_timeout' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'shutdown_timeout' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'cancelled' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'cancelled' }>>()
    expectTypeOf<
      Extract<DeclaredError, { code: 'result_too_large' }>['data']
    >().toEqualTypeOf<Extract<RpcFailure, { kind: 'result_too_large' }>>()
  })
})

describe('contract implementation', () => {
  test('returns plain values and delegates every procedure exactly once', async () => {
    const fixture = createApplication()
    const client = clientFor(fixture.application)
    expect(await client.system.health({})).toMatchObject({ ready: true })
    await client.realm.add({ slug: 'work' })
    await client.realm.list({})
    await client.secrets.status({})
    await client.secrets.backend.set({ target: 'keychain' })
    await client.documentation.list({})
    await client.documentation.get({
      extensionId: 'fixture.docs',
      path: 'README.md',
    })
    await client.documentation.search({ query: 'fixture' })
    await client.source.add({ adapterId: 'local.directory' })
    await client.source.definitions({})
    await client.source.list({})
    await client.source.remove({ source: 'source' })
    const sync = await client.sync.run({ mode: 'sync' })
    expect(await sync.next()).toEqual({
      done: true,
      value: {
        mode: 'sync',
        results: [],
        warnings: [],
      },
    })
    await client.status.get({})
    await client.search.query({ text: 'query' })
    await client.resource.get({ ref })
    await client.thread.get({ ref })
    await client.action.describe({
      actionId: 'example.item.create',
      source: sourceId,
    })
    await client.action.run({
      actionId: 'example.item.create',
      source: sourceId,
      actionInput: { title: 'One' },
      confirmIrreversible: false,
    })
    await client.system.shutdown({})
    expect(fixture.calls).toEqual({
      health: 1,
      realmAdd: 1,
      realmList: 1,
      secretsStatus: 1,
      secretsBackendSet: 1,
      documentationList: 1,
      documentationGet: 1,
      documentationSearch: 1,
      sourceAdd: 1,
      sourceDefinitions: 1,
      sourceList: 1,
      sourceRemove: 1,
      sync: 1,
      status: 1,
      search: 1,
      resourceGet: 1,
      threadGet: 1,
      actionDescribe: 1,
      actionRun: 1,
      shutdown: 1,
    })
  })

  test('throws declared compatibility errors before delegation', async () => {
    const fixture = createApplication()
    const protocolError = await captureError(() =>
      clientFor(
        fixture.application,
        transportContext({ clientProtocol: { ...protocol, version: 3 } }),
      ).system.health({}),
    )
    expect(protocolError).toMatchObject({
      code: 'protocol_incompatible',
      message: rpcErrorMessage,
      data: { kind: 'protocol_incompatible' },
    })
    const runtimeError = await captureError(() =>
      clientFor(
        fixture.application,
        transportContext({
          clientRuntime: { ...runtime, databaseDigest: 'b'.repeat(64) },
        }),
      ).sync.run({ mode: 'sync' }),
    )
    expect(runtimeError).toMatchObject({
      code: 'runtime_identity_mismatch',
      message: rpcErrorMessage,
      data: { kind: 'runtime_identity_mismatch' },
    })
    expect(Object.values(fixture.calls).every((count) => count === 0)).toBe(
      true,
    )
  })

  test('validates ordered stream yields and its terminal return', async () => {
    const fixture = createApplication()
    const event: RpcSyncEvent = {
      type: 'source.started',
      sequence: 0,
      sourceId,
      mode: 'sync',
    }
    const application: DaemonRpcApplication = {
      ...fixture.application,
      sync: {
        run: async () => ({ ok: true, value: syncStream([event]) }),
      },
    }
    const iterator = await clientFor(application).sync.run({ mode: 'sync' })
    expect(await iterator.next()).toEqual({ done: false, value: event })
    expect(await iterator.next()).toEqual({
      done: true,
      value: { mode: 'sync', results: [], warnings: [] },
    })
  })

  test('maps a terminal application failure after progress to its declared error', async () => {
    const fixture = createApplication()
    const event: RpcSyncEvent = {
      type: 'source.started',
      sequence: 0,
      sourceId,
      mode: 'sync',
    }
    const failure: RpcFailure = {
      kind: 'cancelled',
      code: 'cancelled',
      message: 'The request was cancelled.',
    }
    const application: DaemonRpcApplication = {
      ...fixture.application,
      sync: {
        run: async () => ({
          ok: true,
          value: syncStream([event], { ok: false, error: failure }),
        }),
      },
    }
    const iterator = await clientFor(application).sync.run({ mode: 'sync' })
    expect(await iterator.next()).toEqual({ done: false, value: event })
    const error = await captureError(() => iterator.next())
    expect(error).toMatchObject({ code: 'cancelled', data: failure })
  })

  test('rejects malformed stream events and terminal values as bounded internal errors', async () => {
    const fixture = createApplication()
    async function* malformedEventStream() {
      yield {
        type: 'source.started',
        sequence: 0,
        sourceId,
        mode: 'sync',
        cursor: 'secret-canary',
      } as never
      return {
        ok: true as const,
        value: { mode: 'sync', results: [], warnings: [] },
      }
    }
    let application: DaemonRpcApplication = {
      ...fixture.application,
      sync: {
        run: async () => ({ ok: true, value: malformedEventStream() }),
      },
    }
    let iterator = await clientFor(application).sync.run({ mode: 'sync' })
    const malformedEvent = await captureError(() => iterator.next())
    expect(malformedEvent).toMatchObject({
      code: 'ctxindex',
      data: { code: 'internal_error' },
    })
    expect(JSON.stringify(malformedEvent)).not.toContain('secret-canary')

    application = {
      ...fixture.application,
      sync: {
        run: async () => ({
          ok: true,
          value: syncStream([], {
            ok: true,
            value: {
              mode: 'sync',
              results: [],
              warnings: [],
              secret: 'secret-canary',
            },
          } as never),
        }),
      },
    }
    iterator = await clientFor(application).sync.run({ mode: 'sync' })
    const malformedTerminal = await captureError(() => iterator.next())
    expect(malformedTerminal.data).toEqual(malformedEvent.data)
    expect(JSON.stringify(malformedTerminal)).not.toContain('secret-canary')
  })

  test('returns the application iterator when the consumer stops early', async () => {
    const fixture = createApplication()
    let returned = false
    const stream = syncStream([
      {
        type: 'source.started',
        sequence: 0,
        sourceId,
        mode: 'sync',
      },
    ])
    const application: DaemonRpcApplication = {
      ...fixture.application,
      sync: {
        run: async () => ({
          ok: true,
          value: {
            [Symbol.asyncIterator]() {
              return this
            },
            async [Symbol.asyncDispose]() {
              returned = true
            },
            next: () => stream.next(),
            async return() {
              returned = true
              return {
                done: true as const,
                value: {
                  ok: false as const,
                  error: {
                    kind: 'cancelled' as const,
                    code: 'cancelled' as const,
                    message: 'Cancelled.',
                  },
                },
              }
            },
          },
        }),
      },
    }
    const iterator = await clientFor(application).sync.run({ mode: 'sync' })
    await iterator.return?.()
    expect(returned).toBe(true)
  })

  test('round-trips every bounded failure variant as its declared error', async () => {
    const failures: RpcFailure[] = [
      {
        kind: 'ctxindex',
        taxonomy: 'lookup',
        code: 'not_found',
        message: 'Missing.',
      },
      {
        kind: 'daemon_unavailable',
        code: 'daemon_unavailable',
        message: 'Unavailable.',
      },
      {
        kind: 'protocol_incompatible',
        code: 'protocol_incompatible',
        message: 'Mismatch.',
        clientProtocol: protocol,
        daemonProtocol: protocol,
      },
      {
        kind: 'runtime_identity_mismatch',
        code: 'runtime_identity_mismatch',
        message: 'Mismatch.',
        clientRuntime: runtime,
        daemonRuntime: runtime,
      },
      {
        kind: 'database_lease_conflict',
        code: 'database_lease_conflict',
        message: 'Busy.',
        databaseDigest: digest,
      },
      {
        kind: 'prototype_unsupported',
        code: 'prototype_unsupported',
        message: 'Unsupported.',
        command: 'artifact',
      },
      {
        kind: 'shutdown_timeout',
        code: 'shutdown_timeout',
        message: 'Timeout.',
        instanceId: 'instance',
        timeoutMs: 100,
      },
      { kind: 'cancelled', code: 'cancelled', message: 'Cancelled.' },
      { kind: 'result_too_large', code: 'result_too_large', message: 'Large.' },
    ]
    for (const failure of failures) {
      const fixture = createApplication()
      const application: DaemonRpcApplication = {
        ...fixture.application,
        sync: { run: async () => ({ ok: false, error: failure }) },
      }
      const error = await captureError(() =>
        clientFor(application).sync.run({ mode: 'sync' }),
      )
      expect(error.defined).toBe(true)
      expect(error.code).toBe(failure.kind)
      expect(error.message).toBe(rpcErrorMessage)
      expect(error.data).toEqual(failure)
      expect(rpcFailureRegistry[failure.kind].data.parse(failure)).toEqual(
        failure,
      )
    }
  })

  test('replaces throws and malformed unsafe output with one bounded internal error', async () => {
    const fixture = createApplication()
    let application: DaemonRpcApplication = {
      ...fixture.application,
      sync: {
        run: async () => {
          throw new Error('secret-canary /private/db.sqlite provider-body')
        },
      },
    }
    const thrown = await captureError(() =>
      clientFor(application).sync.run({ mode: 'sync' }),
    )
    expect(thrown).toMatchObject({
      code: 'ctxindex',
      message: rpcErrorMessage,
      data: {
        kind: 'ctxindex',
        taxonomy: 'other',
        code: 'internal_error',
        message: 'The daemon could not complete the request.',
      },
    })
    expect(JSON.stringify(thrown)).not.toMatch(
      /secret-canary|private|provider-body/,
    )

    application = {
      ...fixture.application,
      sync: {
        run: async () =>
          ({
            ok: true,
            value: {
              mode: 'sync',
              results: [{ cause: new Error('secret-canary') }],
              warnings: [],
            },
          }) as never,
      },
    }
    const malformed = await captureError(() =>
      clientFor(application).sync.run({ mode: 'sync' }),
    )
    expect(malformed.data).toEqual(thrown.data)

    application = {
      ...fixture.application,
      sync: {
        run: async () =>
          Object.defineProperty({}, 'ok', {
            get() {
              throw new ORPCError('cancelled', {
                message: rpcErrorMessage,
                data: {
                  kind: 'cancelled',
                  code: 'cancelled',
                  message: 'Application-selected cancellation.',
                },
              })
            },
          }) as never,
      },
    }
    const accessorThrow = await captureError(() =>
      clientFor(application).sync.run({ mode: 'sync' }),
    )
    expect(accessorThrow.code).toBe('ctxindex')
    expect(accessorThrow.data).toEqual(thrown.data)
  })

  test('forwards oRPC native signal identity and supplies a safe in-process fallback', async () => {
    const fixture = createApplication()
    const controller = new AbortController()
    await clientFor(fixture.application).search.query(
      { text: 'query' },
      { signal: controller.signal },
    )
    expect(fixture.contexts[0]?.signal).toBe(controller.signal)
    expect(fixture.contexts[0]).toMatchObject(transportContext())

    await clientFor(fixture.application).status.get({})
    const fallback = fixture.contexts[1]?.signal
    expect(fallback).toBeInstanceOf(AbortSignal)
    expect(fallback?.aborted).toBe(false)
  })
})
