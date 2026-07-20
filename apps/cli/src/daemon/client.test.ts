import { expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import { rpcFailureRegistry } from '@ctxindex/rpc'
import { ORPCError } from '@orpc/client'
import {
  type DaemonSelection,
  daemonFailureFromDeclaredError,
  daemonHealth,
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
      protocolVersion: 1,
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
        'The local daemon is unavailable. Start it with `ctxindex daemon serve`.',
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
