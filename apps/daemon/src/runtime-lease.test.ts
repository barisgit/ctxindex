import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  acquireFileLease,
  createFileLeaseBackend,
  type FileLeaseBackend,
  FileLeaseConflictError,
  FileLeaseUnsupportedError,
  leasePath,
  resolveRuntimeIdentity,
  UnsafeFileLeaseError,
} from '@ctxindex/local-daemon'
import { type StartDaemonOptions, startDaemon } from './runtime'

// These tests drive startDaemon through the real retained-lease backends
// rather than fake leases: the Linux flock backend with an injected helper
// resolver/spawner (runs everywhere), and the native backend of the current
// supported platform.

const sandboxes: string[] = []

afterEach(async () => {
  for (const path of sandboxes.splice(0))
    await rm(path, { recursive: true, force: true })
})

async function privateRoots() {
  const sandbox = await realpath(
    await mkdtemp(join(tmpdir(), 'ctxindex-daemon-lease-')),
  )
  const runtimeRoot = await mkdtemp('/tmp/ctxd-lease-')
  sandboxes.push(sandbox, runtimeRoot)
  const roots = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  for (const path of Object.values(roots)) await mkdir(path, { mode: 0o700 })
  return { roots, runtimeRoot, resolved: resolveRuntimeIdentity(roots) }
}

function stubHooks(events: string[]): NonNullable<StartDaemonOptions['hooks']> {
  return {
    readMatchingMetadata: () => null,
    readConfig: async () => {
      events.push('config')
      return {} as never
    },
    readInstalled: async () => ({ records: [], diagnostics: [] }),
    openDatabase: async () => {
      events.push('open')
      return { close: () => events.push('close:db') } as never
    },
    runMigrations: async () => {},
    listLocalOAuthAppIdentities: () => [],
    loadExtensions: async () => ({
      registry: {} as never,
      completeRegistry: {} as never,
      provenance: [],
      diagnostics: [],
      documentation: { list: () => [], get: () => undefined },
    }),
    composeServices: () => ({
      syncService: {
        run: async () => ({
          mode: 'sync' as const,
          results: [],
          skipped: [],
          warnings: [],
        }),
      },
      sourceService: {
        resolveSourceId: (value: string) => value,
        getStatus: () => [],
      },
    }),
    bind: () => ({ stop: () => {} }),
    writeMetadata: (_root, metadata) =>
      events.push(`metadata:${metadata.lifecycle}`),
    cleanupMetadata: () => 'removed',
    removeEndpoint: () => {},
  }
}

async function expectStartupFailsBeforeOpen(
  leaseBackend: FileLeaseBackend,
  setup?: (
    resolved: ReturnType<typeof resolveRuntimeIdentity>,
  ) => Promise<void>,
): Promise<unknown> {
  const { roots, runtimeRoot, resolved } = await privateRoots()
  await setup?.(resolved)
  const events: string[] = []
  let caught: unknown
  try {
    await startDaemon({
      roots,
      endpointRuntimeRoot: runtimeRoot,
      leaseBackend,
      hooks: stubHooks(events),
    })
  } catch (error) {
    caught = error
  }
  expect(caught).toBeDefined()
  // Nothing after lease acquisition ran: no discovery publication, config
  // read, or SQLite open.
  expect(events).toEqual([])
  return caught
}

describe('daemon startup over the Linux retained flock backend', () => {
  test('a missing or untrusted flock helper fails closed before SQLite open', async () => {
    let spawned = false
    const failure = await expectStartupFailsBeforeOpen(
      createFileLeaseBackend({
        platform: 'linux',
        resolveFlock: () => null,
        spawnFlock: () => {
          spawned = true
          return { status: 0 }
        },
      }),
    )
    expect(failure).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(failure).toMatchObject({ reason: 'platform' })
    expect(spawned).toBe(false)
  })

  test('an unusable flock primitive fails closed before SQLite open', async () => {
    const failure = await expectStartupFailsBeforeOpen(
      createFileLeaseBackend({
        platform: 'linux',
        resolveFlock: () => '/usr/bin/flock',
        spawnFlock: () => ({ status: 1 }),
      }),
    )
    expect(failure).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(failure).toMatchObject({ reason: 'filesystem' })
  })

  test('an unsafe database lease file fails closed before SQLite open', async () => {
    const failure = await expectStartupFailsBeforeOpen(
      createFileLeaseBackend({
        platform: 'linux',
        resolveFlock: () => '/usr/bin/flock',
        spawnFlock: () => ({ status: 0 }),
      }),
      async (resolved) => {
        const path = leasePath({
          canonicalTarget: resolved.databasePath,
          purpose: 'database',
          mode: 'exclusive',
        })
        await writeFile(path, '')
        await chmod(path, 0o644)
      },
    )
    expect(failure).toBeInstanceOf(UnsafeFileLeaseError)
    expect(String(failure)).toMatch(/private mode/i)
  })
})

describe.skipIf(process.platform !== 'darwin' && process.platform !== 'linux')(
  'daemon startup over the native retained lease backend',
  () => {
    test('retains lifecycle and database ownership from before SQLite open until after close', async () => {
      const { roots, runtimeRoot, resolved } = await privateRoots()
      const lifecycle = {
        canonicalTarget: resolved.stateRoot,
        purpose: 'lifecycle',
        mode: 'exclusive',
      } as const
      const database = {
        canonicalTarget: resolved.databasePath,
        purpose: 'database',
        mode: 'exclusive',
      } as const
      const events: string[] = []
      const expectHeld = (label: string) => {
        for (const request of [lifecycle, database]) {
          expect(() => acquireFileLease(request), label).toThrow(
            FileLeaseConflictError,
          )
        }
        events.push(`held:${label}`)
      }
      const hooks = stubHooks(events)

      const daemon = await startDaemon({
        roots,
        endpointRuntimeRoot: runtimeRoot,
        hooks: {
          ...hooks,
          openDatabase: async () => {
            expectHeld('open')
            return {
              close: () => expectHeld('close'),
            } as never
          },
        },
      })
      expectHeld('ready')
      await daemon.close()

      expect(events).toContain('held:open')
      expect(events).toContain('held:close')
      for (const request of [lifecycle, database]) {
        acquireFileLease(request).release()
        expect(existsSync(leasePath(request))).toBe(true)
      }
    })
  },
)
