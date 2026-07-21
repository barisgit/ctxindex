import { expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import {
  type DaemonClient,
  type RpcAccountAddEvent,
  type RpcAccountAddResult,
  type RpcFailure,
  type RpcSyncEvent,
  type RpcSyncResult,
  rpcFailureRegistry,
} from '@ctxindex/rpc'
import { ORPCError } from '@orpc/client'
import {
  type DaemonSelection,
  daemonAccountAdd,
  daemonExport,
  daemonFailureFromDeclaredError,
  daemonHealth,
  daemonOAuthAppAdd,
  daemonSync,
  daemonTransferToFile,
  registerDaemonReconnect,
  selectDaemonForRuntime,
} from './client'

const rpcErrorMessage = rpcFailureRegistry.ctxindex.message

test('maps only validated declared oRPC errors to bounded daemon failures', () => {
  const failure = {
    kind: 'cancelled' as const,
    code: 'cancelled' as const,
    message: 'The daemon request was cancelled.',
  }
  expect(
    daemonFailureFromDeclaredError(
      new ORPCError('cancelled', {
        defined: true,
        message: rpcErrorMessage,
        data: failure,
      }),
    ),
  ).toEqual(failure)
  expect(
    daemonFailureFromDeclaredError(
      new ORPCError('wrong_code', {
        defined: true,
        message: rpcErrorMessage,
        data: failure,
      }),
    ),
  ).toBeNull()
  expect(
    daemonFailureFromDeclaredError(new Error('raw socket path')),
  ).toBeNull()
  expect(
    daemonFailureFromDeclaredError(
      new ORPCError('cancelled', {
        defined: true,
        message: rpcErrorMessage,
        data: { ...failure, stack: 'secret-canary' },
      }),
    ),
  ).toBeNull()

  const canary = new Error('secret-canary /private/db.sqlite')
  const throwingPrototype = new Proxy(
    new ORPCError('cancelled', {
      defined: true,
      message: rpcErrorMessage,
      data: failure,
    }),
    {
      getPrototypeOf: () => {
        throw canary
      },
    },
  )
  const throwingProperty = new Proxy(
    new ORPCError('cancelled', {
      defined: true,
      message: rpcErrorMessage,
      data: failure,
    }),
    {
      get(target, property, receiver) {
        if (property === 'defined') throw canary
        return Reflect.get(target, property, receiver)
      },
    },
  )
  expect(() => daemonFailureFromDeclaredError(throwingPrototype)).not.toThrow()
  expect(daemonFailureFromDeclaredError(throwingPrototype)).toBeNull()
  expect(() => daemonFailureFromDeclaredError(throwingProperty)).not.toThrow()
  expect(daemonFailureFromDeclaredError(throwingProperty)).toBeNull()
})

test('hazardous transport errors become daemon_unavailable without leaking raw data', async () => {
  const setup = await fixture()
  const canary = new Error('secret-canary /private/db.sqlite')
  const hazardous = new Proxy(
    new ORPCError('cancelled', {
      defined: true,
      message: rpcErrorMessage,
      data: {
        kind: 'cancelled',
        code: 'cancelled',
        message: 'The request was cancelled.',
      },
    }),
    {
      get(target, property, receiver) {
        if (property === 'defined') throw canary
        return Reflect.get(target, property, receiver)
      },
    },
  )
  const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(hazardous)
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-hostile-error.sock',
    }) as DaemonSelection
    const error = await daemonHealth(selection).catch((value) => value)
    expect(error).toMatchObject({ code: 'daemon_unavailable' })
    expect(String(error)).not.toMatch(/secret-canary|private|db\.sqlite/)

    const controller = new AbortController()
    controller.abort()
    await expect(
      daemonHealth(selection, controller.signal),
    ).rejects.toMatchObject({ code: 'cancelled' })
  } finally {
    fetch.mockRestore()
    await setup.close()
  }
})

test('daemon export consumes one opaque transfer as exact bytes over the Unix socket', async () => {
  const setup = await fixture()
  const selection = selectDaemonForRuntime(setup.runtime, {
    testEndpoint: '/tmp/ctxd-export.sock',
  }) as DaemonSelection
  const ref = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/item/one'
  let request: { input: unknown; options: unknown } | undefined
  let transferRequest:
    | { url: unknown; init: RequestInit | undefined }
    | undefined
  const client = {
    export: {
      prepare: async (input: unknown, options: unknown) => {
        request = { input, options }
        return {
          transfer: {
            ticket: 'a'.repeat(64),
            byteSize: 3,
            expiresAt: 1_000,
          },
          mediaType: 'application/octet-stream',
          format: 'binary',
          ref,
          warnings: [],
        }
      },
    },
  } as unknown as DaemonClient
  try {
    const result = await daemonExport(
      selection,
      { ref, format: 'binary' },
      undefined,
      {
        createClient: () => client,
        fetch: (async (url: unknown, init?: RequestInit) => {
          transferRequest = { url, init }
          return new Response(Uint8Array.of(0, 255, 1))
        }) as typeof fetch,
      },
    )
    expect(result).toEqual({
      bytes: Uint8Array.of(0, 255, 1),
      mediaType: 'application/octet-stream',
      format: 'binary',
      ref,
      warnings: [],
    })
    expect(request?.input).toEqual({ ref, format: 'binary' })
    expect(transferRequest).toMatchObject({
      url: `http://localhost/transfer/${'a'.repeat(64)}`,
      init: { method: 'GET', unix: selection.endpoint, redirect: 'manual' },
    })
  } finally {
    await setup.close()
  }
})

test('daemon transfer creates a private no-overwrite output atomically', async () => {
  const setup = await fixture()
  const selection = selectDaemonForRuntime(setup.runtime, {
    testEndpoint: '/tmp/ctxd-transfer-file.sock',
  }) as DaemonSelection
  const output = join(setup.sandbox, 'export.bin')
  const transfer = {
    ticket: 'a'.repeat(64),
    byteSize: 3,
    expiresAt: 1_000,
  }
  const services = {
    fetch: (async () =>
      new Response(Uint8Array.of(0, 255, 1))) as unknown as typeof fetch,
  }
  try {
    await daemonTransferToFile(selection, transfer, output, undefined, services)
    expect(new Uint8Array(await readFile(output))).toEqual(
      Uint8Array.of(0, 255, 1),
    )
    expect((await stat(output)).mode & 0o777).toBe(0o600)

    await writeFile(output, 'existing')
    await expect(
      daemonTransferToFile(selection, transfer, output, undefined, services),
    ).rejects.toMatchObject({ code: 'output_exists' })
  } finally {
    await setup.close()
  }
})

function syncClient(
  iterator: AsyncIteratorObject<RpcSyncEvent, RpcSyncResult, void>,
): DaemonClient {
  return {
    sync: { run: async () => iterator },
  } as unknown as DaemonClient
}

function accountClient(input: {
  readonly iterator: AsyncIteratorObject<
    RpcAccountAddEvent,
    RpcAccountAddResult,
    void
  >
  readonly respond: (value: string) => Promise<void>
}): DaemonClient {
  return {
    account: {
      add: async () => input.iterator,
      respond: async ({ response }: { readonly response: string }) => {
        await input.respond(response)
        return { accepted: true }
      },
    },
  } as unknown as DaemonClient
}

test('daemon Account add sends hidden input separately and races automatic loopback completion', async () => {
  const setup = await fixture()
  const selection = selectDaemonForRuntime(setup.runtime, {
    testEndpoint: '/tmp/ctxd-account-client.sock',
  }) as DaemonSelection
  const event: RpcAccountAddEvent = {
    type: 'authorization.required',
    requestId: 'request-id',
    authorizationUrl: 'https://accounts.example/authorize?state=opaque',
  }
  let index = 0
  let settle!: () => void
  const settled = new Promise<void>((resolve) => {
    settle = resolve
  })
  const responses: string[] = []
  const iterator = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (index++ === 0) return { done: false as const, value: event }
      await settled
      return { done: true as const, value: { accountId: 'account-id' } }
    },
  } as AsyncIteratorObject<RpcAccountAddEvent, RpcAccountAddResult, void>
  const client = accountClient({
    iterator,
    respond: async (value) => {
      responses.push(value)
      settle()
    },
  })
  const urls: string[] = []
  const secret = 'http://localhost/callback?code=private-code&state=opaque'
  try {
    expect(
      await daemonAccountAdd(
        selection,
        { provider: 'google', app: 'desktop' },
        {
          emitAuthorizationUrl: (url) => {
            urls.push(url)
          },
          readAuthorizationResponse: async () => secret,
        },
        undefined,
        { createClient: () => client },
      ),
    ).toEqual({ accountId: 'account-id' })
    expect(urls).toEqual([event.authorizationUrl])
    expect(responses).toEqual([secret])

    let promptAborted = false
    let automaticIndex = 0
    const automatic = {
      [Symbol.asyncIterator]() {
        return this
      },
      async next() {
        return automaticIndex++ === 0
          ? { done: false as const, value: event }
          : { done: true as const, value: { accountId: 'automatic-id' } }
      },
    } as AsyncIteratorObject<RpcAccountAddEvent, RpcAccountAddResult, void>
    expect(
      await daemonAccountAdd(
        selection,
        { provider: 'google' },
        {
          emitAuthorizationUrl() {},
          readAuthorizationResponse: ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener(
                'abort',
                () => {
                  promptAborted = true
                  resolve(undefined)
                },
                { once: true },
              )
            }),
        },
        undefined,
        {
          createClient: () =>
            accountClient({ iterator: automatic, respond: async () => {} }),
        },
      ),
    ).toEqual({ accountId: 'automatic-id' })
    expect(promptAborted).toBe(true)
  } finally {
    await setup.close()
  }
})

test('daemon Account add never replays after a declared admission rejection', async () => {
  const setup = await fixture()
  let reconnects = 0
  let calls = 0
  const rejection: RpcFailure = {
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message: 'The daemon is stopping and is not accepting new work.',
  }
  try {
    const base = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-account-no-replay.sock',
    }) as DaemonSelection
    const selection = registerDaemonReconnect(base, async () => {
      reconnects += 1
      return { ...base, endpoint: '/tmp/ctxd-account-replacement.sock' }
    })
    await expect(
      daemonAccountAdd(
        selection,
        { provider: 'google' },
        {
          emitAuthorizationUrl() {},
          readAuthorizationResponse: async () => undefined,
        },
        undefined,
        {
          createClient: () => {
            calls += 1
            return {
              account: {
                add: async () => {
                  throw new ORPCError(rejection.kind, {
                    defined: true,
                    message: rpcFailureRegistry[rejection.kind].message,
                    data: rejection,
                  })
                },
              },
            } as unknown as DaemonClient
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(calls).toBe(1)
    expect(reconnects).toBe(0)
  } finally {
    await setup.close()
  }
})

test('daemon Account add maps prompt cancellation before transport teardown', async () => {
  const setup = await fixture()
  const controller = new AbortController()
  const selection = selectDaemonForRuntime(setup.runtime, {
    testEndpoint: '/tmp/ctxd-account-cancel.sock',
  }) as DaemonSelection
  let index = 0
  const iterator = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (index++ === 0)
        return {
          done: false as const,
          value: {
            type: 'authorization.required' as const,
            requestId: 'request-id',
            authorizationUrl: 'https://accounts.example/authorize',
          },
        }
      return new Promise<never>((_resolve, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('transport closed')),
          { once: true },
        )
      })
    },
  } as AsyncIteratorObject<RpcAccountAddEvent, RpcAccountAddResult, void>
  try {
    await expect(
      daemonAccountAdd(
        selection,
        { provider: 'google' },
        {
          emitAuthorizationUrl() {},
          readAuthorizationResponse: async () => {
            controller.abort()
            return undefined
          },
        },
        controller.signal,
        {
          createClient: () =>
            accountClient({ iterator, respond: async () => {} }),
        },
      ),
    ).rejects.toMatchObject({ code: 'cancelled' })
  } finally {
    await setup.close()
  }
})

test('daemon Account terminal rejection always aborts hidden prompt input', async () => {
  const setup = await fixture()
  const selection = selectDaemonForRuntime(setup.runtime, {
    testEndpoint: '/tmp/ctxd-account-terminal-rejection.sock',
  }) as DaemonSelection
  let index = 0
  let promptAborted = false
  const iterator = {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (index++ === 0)
        return {
          done: false as const,
          value: {
            type: 'authorization.required' as const,
            requestId: 'request-id',
            authorizationUrl: 'https://accounts.example/authorize',
          },
        }
      throw new Error('terminal transport rejection')
    },
  } as AsyncIteratorObject<RpcAccountAddEvent, RpcAccountAddResult, void>
  try {
    await expect(
      daemonAccountAdd(
        selection,
        { provider: 'google' },
        {
          emitAuthorizationUrl() {},
          readAuthorizationResponse: ({ signal }) =>
            new Promise((resolve) => {
              signal.addEventListener(
                'abort',
                () => {
                  promptAborted = true
                  resolve(undefined)
                },
                { once: true },
              )
            }),
        },
        undefined,
        {
          createClient: () =>
            accountClient({ iterator, respond: async () => {} }),
        },
      ),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(promptAborted).toBe(true)
  } finally {
    await setup.close()
  }
})

test('daemon OAuth App add never replays secret-bearing config', async () => {
  const setup = await fixture()
  let reconnects = 0
  let calls = 0
  const rejection: RpcFailure = {
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message: 'The daemon is stopping and is not accepting new work.',
  }
  try {
    const base = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-oauth-app-no-replay.sock',
    }) as DaemonSelection
    const selection = registerDaemonReconnect(base, async () => {
      reconnects += 1
      return { ...base, endpoint: '/tmp/ctxd-oauth-app-replacement.sock' }
    })
    await expect(
      daemonOAuthAppAdd(
        selection,
        { provider: 'google', label: 'desktop', config: { clientId: 'id' } },
        undefined,
        {
          createClient: () => {
            calls += 1
            return {
              oauthApp: {
                add: async () => {
                  throw new ORPCError(rejection.kind, {
                    defined: true,
                    message: rpcFailureRegistry[rejection.kind].message,
                    data: rejection,
                  })
                },
              },
            } as unknown as DaemonClient
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(calls).toBe(1)
    expect(reconnects).toBe(0)
  } finally {
    await setup.close()
  }
})

function syncIterator(
  events: readonly RpcSyncEvent[],
  terminal: RpcSyncResult | RpcFailure,
  onReturn?: () => void,
): AsyncIteratorObject<RpcSyncEvent, RpcSyncResult, void> {
  let index = 0
  const iterator: AsyncIteratorObject<RpcSyncEvent, RpcSyncResult, void> = {
    [Symbol.asyncIterator]() {
      return iterator
    },
    async [Symbol.asyncDispose]() {
      onReturn?.()
    },
    async next() {
      const event = events[index++]
      if (event) return { done: false, value: event }
      if ('kind' in terminal) {
        throw new ORPCError(terminal.kind, {
          defined: true,
          message: rpcFailureRegistry[terminal.kind].message,
          data: terminal,
        })
      }
      return { done: true, value: terminal }
    },
    async return(value) {
      onReturn?.()
      return {
        done: true,
        value: await value,
      } as IteratorReturnResult<RpcSyncResult>
    },
  }
  return iterator
}

test('daemon sync preserves live order, awaited delivery, and the iterator terminal return', async () => {
  const setup = await fixture()
  const events: RpcSyncEvent[] = [
    {
      type: 'source.started',
      sequence: 0,
      sourceId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      mode: 'sync',
    },
    {
      type: 'source.progress',
      sequence: 1,
      sourceId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      processed: 1,
      upserts: 1,
      removals: 0,
      checkpoints: 0,
      warningsCount: 0,
    },
  ]
  const terminal: RpcSyncResult = {
    mode: 'sync',
    results: [],
    warnings: [],
  }
  const observed: RpcSyncEvent[] = []
  let callbackSettled = true
  const iterator = syncIterator(events, terminal)
  const originalNext = iterator.next.bind(iterator)
  iterator.next = async () => {
    expect(callbackSettled).toBe(true)
    return originalNext()
  }
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-sync-client.sock',
    }) as DaemonSelection
    expect(
      await daemonSync(
        selection,
        { mode: 'sync' },
        undefined,
        async (event) => {
          callbackSettled = false
          await Promise.resolve()
          observed.push(event)
          callbackSettled = true
        },
        { createClient: () => syncClient(iterator) },
      ),
    ).toEqual(terminal)
    expect(observed).toEqual(events)
  } finally {
    await setup.close()
  }
})

test('reconnects once only when the daemon declares rejection before stream admission', async () => {
  const setup = await fixture()
  const terminal: RpcSyncResult = { mode: 'sync', results: [], warnings: [] }
  const rejection: RpcFailure = {
    kind: 'daemon_unavailable',
    code: 'daemon_unavailable',
    message: 'The daemon is stopping and is not accepting new work.',
  }
  let reconnects = 0
  let calls = 0
  try {
    const base = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-sync-reconnect.sock',
    }) as DaemonSelection
    const replacement = { ...base, endpoint: '/tmp/ctxd-sync-replacement.sock' }
    const selection = registerDaemonReconnect(base, async () => {
      reconnects += 1
      return replacement
    })
    const result = await daemonSync(
      selection,
      { mode: 'sync' },
      undefined,
      undefined,
      {
        createClient: (selected) => {
          calls += 1
          if (selected === selection) {
            return {
              sync: {
                run: async () => {
                  throw new ORPCError(rejection.kind, {
                    defined: true,
                    message: rpcFailureRegistry[rejection.kind].message,
                    data: rejection,
                  })
                },
              },
            } as unknown as DaemonClient
          }
          return syncClient(syncIterator([], terminal))
        },
      },
    )

    expect(result).toEqual(terminal)
    expect(reconnects).toBe(1)
    expect(calls).toBe(2)
  } finally {
    await setup.close()
  }
})

test('never reconnects after ambiguous transport failure or a second rejection', async () => {
  const setup = await fixture()
  let reconnects = 0
  try {
    const base = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-sync-no-replay.sock',
    }) as DaemonSelection
    const selection = registerDaemonReconnect(base, async () => {
      reconnects += 1
      return { ...base, endpoint: '/tmp/ctxd-sync-no-replay-2.sock' }
    })
    await expect(
      daemonSync(selection, { mode: 'sync' }, undefined, undefined, {
        createClient: () =>
          ({
            sync: {
              run: async () => Promise.reject(new Error('socket reset')),
            },
          }) as unknown as DaemonClient,
      }),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(reconnects).toBe(0)

    const rejection: RpcFailure = {
      kind: 'daemon_unavailable',
      code: 'daemon_unavailable',
      message: 'The daemon is stopping and is not accepting new work.',
    }
    await expect(
      daemonSync(selection, { mode: 'sync' }, undefined, undefined, {
        createClient: () =>
          ({
            sync: {
              run: async () => {
                throw new ORPCError(rejection.kind, {
                  defined: true,
                  message: rpcFailureRegistry[rejection.kind].message,
                  data: rejection,
                })
              },
            },
          }) as unknown as DaemonClient,
      }),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(reconnects).toBe(1)
  } finally {
    await setup.close()
  }
})

test('daemon sync returns the iterator on consumer failure and normalizes stream errors', async () => {
  const setup = await fixture()
  const event: RpcSyncEvent = {
    type: 'source.started',
    sequence: 0,
    sourceId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    mode: 'sync',
  }
  let returned = false
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-sync-client.sock',
    }) as DaemonSelection
    await expect(
      daemonSync(
        selection,
        { mode: 'sync' },
        undefined,
        () => {
          throw new Error('consumer stopped')
        },
        {
          createClient: () =>
            syncClient(
              syncIterator(
                [event],
                { mode: 'sync', results: [], warnings: [] },
                () => {
                  returned = true
                },
              ),
            ),
        },
      ),
    ).rejects.toMatchObject({ code: 'daemon_unavailable' })
    expect(returned).toBe(true)

    const failure: RpcFailure = {
      kind: 'cancelled',
      code: 'cancelled',
      message: 'The request was cancelled.',
    }
    await expect(
      daemonSync(selection, { mode: 'sync' }, undefined, undefined, {
        createClient: () => syncClient(syncIterator([], failure)),
      }),
    ).rejects.toMatchObject({ code: 'cancelled', failure })
  } finally {
    await setup.close()
  }
})

async function fixture() {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-cli-daemon-'))
  const runtimeRoot = await mkdtemp('/tmp/ctxd-cli-')
  const paths = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  await Promise.all(
    Object.values(paths).map((path) => mkdir(path, { recursive: true })),
  )
  return {
    sandbox,
    runtimeRoot,
    runtime: resolveRuntimeIdentity(paths),
    async close() {
      await rm(sandbox, { recursive: true, force: true })
      await rm(runtimeRoot, { recursive: true, force: true })
    },
  }
}

test('selects only an explicit test override or exact-tuple metadata', async () => {
  const setup = await fixture()
  try {
    expect(
      selectDaemonForRuntime(setup.runtime, {
        readMetadata: () => null,
      }),
    ).toBeNull()

    const override = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-explicit-test.sock',
      readMetadata: () => {
        throw new Error('override must not read discovery')
      },
    })
    expect(override).toMatchObject({
      endpoint: '/tmp/ctxd-explicit-test.sock',
      selectedBy: 'test_override',
      metadata: null,
    })

    const metadata = {
      schemaVersion: 1 as const,
      protocolId: 'ctxindex.local' as const,
      protocolVersion: 2,
      ...setup.runtime.identity,
      instanceId: 'instance-1',
      ownerToken: 'a'.repeat(64),
      pid: 123,
      startedAt: '2026-07-18T00:00:00.000Z',
      lifecycle: 'ready' as const,
      endpointToken: `ctxd-${setup.runtime.identity.tupleDigest.slice(0, 24)}.sock`,
    }
    expect(
      selectDaemonForRuntime(setup.runtime, {
        endpointRuntimeRoot: setup.runtimeRoot,
        readMetadata: () => metadata,
      }),
    ).toMatchObject({ selectedBy: 'metadata', metadata })

    const otherDigest = 'b'.repeat(64)
    expect(() =>
      selectDaemonForRuntime(setup.runtime, {
        readMetadata: () => ({
          ...metadata,
          tupleDigest: otherDigest,
          dataDigest: otherDigest,
          databaseDigest: otherDigest,
        }),
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'runtime_identity_mismatch',
        failure: expect.objectContaining({
          clientRuntime: setup.runtime.identity,
          daemonRuntime: expect.objectContaining({
            tupleDigest: otherDigest,
            dataDigest: otherDigest,
            databaseDigest: otherDigest,
          }),
        }),
      }),
    )
  } finally {
    await setup.close()
  }
})

test('a selected unreachable endpoint is unavailable and never becomes a direct route', async () => {
  const setup = await fixture()
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-definitely-missing.sock',
    }) as DaemonSelection
    await expect(daemonHealth(selection)).rejects.toMatchObject({
      code: 'daemon_unavailable',
      message:
        'The local daemon is unavailable. Start it with `ctxindex daemon start`.',
    })
  } finally {
    await setup.close()
  }
})

test('an already-aborted selected request is cancellation, not unavailability', async () => {
  const setup = await fixture()
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-cancelled.sock',
    }) as DaemonSelection
    const controller = new AbortController()
    controller.abort()
    await expect(
      daemonHealth(selection, controller.signal),
    ).rejects.toMatchObject({ code: 'cancelled' })
  } finally {
    await setup.close()
  }
})

test('unix transport preserves the RPC fetch init', async () => {
  const setup = await fixture()
  const controller = new AbortController()
  let observedInit: RequestInit | undefined
  const fetch = spyOn(globalThis, 'fetch').mockImplementation((async (
    _request: string | URL | Request,
    init?: RequestInit,
  ) => {
    observedInit = init
    throw new Error('stop after observing init')
  }) as unknown as typeof globalThis.fetch)
  try {
    const selection = selectDaemonForRuntime(setup.runtime, {
      testEndpoint: '/tmp/ctxd-init.sock',
    }) as DaemonSelection
    await expect(
      daemonHealth(selection, controller.signal),
    ).rejects.toMatchObject({
      code: 'daemon_unavailable',
    })
    expect(observedInit).toMatchObject({
      redirect: 'manual',
      unix: selection.endpoint,
    })
  } finally {
    fetch.mockRestore()
    await setup.close()
  }
})

test.each([
  ['starting', 'The local daemon is starting and is not yet available.'],
  ['stopping', 'The local daemon is stopping and is no longer available.'],
] as const)('unavailable diagnostics reflect discovered %s lifecycle', async (lifecycle, message) => {
  const setup = await fixture()
  const fetch = spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('offline'),
  )
  try {
    const selection = {
      endpoint: '/tmp/ctxd-lifecycle.sock',
      roots: setup.runtime,
      selectedBy: 'metadata',
      metadata: {
        schemaVersion: 1,
        protocolId: 'ctxindex.local',
        protocolVersion: 2,
        ...setup.runtime.identity,
        instanceId: 'instance-1',
        ownerToken: 'a'.repeat(64),
        pid: 123,
        startedAt: '2026-07-18T00:00:00.000Z',
        lifecycle,
        endpointToken: `ctxd-${setup.runtime.identity.tupleDigest.slice(0, 24)}.sock`,
      },
    } satisfies DaemonSelection
    await expect(daemonHealth(selection)).rejects.toMatchObject({ message })
  } finally {
    fetch.mockRestore()
    await setup.close()
  }
})
