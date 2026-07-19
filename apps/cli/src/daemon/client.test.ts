import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import {
  type DaemonSelection,
  daemonHealth,
  selectDaemonForRuntime,
} from './client'

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
