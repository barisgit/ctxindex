import { expect, test } from 'bun:test'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { googleOAuthProvider } from '@ctxindex/adapters'
import { defaultConfig } from '@ctxindex/core/config'
import { loadExtensions } from '@ctxindex/core/extension'
import { openDatabase, runMigrations } from '@ctxindex/core/storage'
import type { FileLease, FileLeaseBackend } from '@ctxindex/local-daemon'
import {
  FileLeaseConflictError,
  resolveEndpoint,
  resolveRuntimeIdentity,
} from '@ctxindex/local-daemon'
import {
  isDaemonStartupFailure,
  type StartDaemonOptions,
  startDaemon,
} from './runtime'

const emptyDocumentation = {
  list: () => [],
  get: () => undefined,
} as const

function lease(name: string, events: string[]): FileLease {
  return {
    mode: 'exclusive',
    targetDigest: name.padEnd(64, '0'),
    release: () => events.push(`release:${name}`),
  }
}

test('database lease contention becomes a bounded structured startup failure', async () => {
  const events: string[] = []
  let caught: unknown
  try {
    await startDaemon({
      roots: {
        configRoot: '/tmp/ctxd-conflict-config',
        dataRoot: '/tmp/ctxd-conflict-data',
        stateRoot: '/tmp/ctxd-conflict-state',
        cacheRoot: '/tmp/ctxd-conflict-cache',
      },
      endpointRuntimeRoot: '/tmp/ctxd-conflict-runtime',
      leaseBackend: {
        acquire(input) {
          if (input.purpose === 'database') {
            throw new FileLeaseConflictError('a'.repeat(64))
          }
          return lease(input.purpose, events)
        },
      },
      hooks: { readMatchingMetadata: () => null },
    })
  } catch (error) {
    caught = error
  }

  expect(caught).toEqual({
    kind: 'database_lease_conflict',
    code: 'database_lease_conflict',
    message: 'The database is held by another local process/runtime.',
    databaseDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
  })
  const serialized = JSON.stringify(caught)
  expect(serialized).not.toContain('/tmp/')
  expect(serialized).not.toContain('stack')
  expect(events).toEqual(['release:lifecycle'])
})

test('startup failure guard rejects owner-attributed lease conflicts', () => {
  expect(
    isDaemonStartupFailure({
      kind: 'database_lease_conflict',
      code: 'database_lease_conflict',
      message: 'The database is held by another local process/runtime.',
      databaseDigest: 'a'.repeat(64),
      ownerTupleDigest: 'b'.repeat(64),
    }),
  ).toBe(false)
})

test('startup owns leases before one load/open and publishes ready last', async () => {
  const events: string[] = []
  let lifecycleProof: FileLease | undefined
  const leases: FileLeaseBackend = {
    acquire(input) {
      events.push(`lease:${input.purpose}`)
      const acquired = lease(input.purpose, events)
      if (input.purpose === 'lifecycle') lifecycleProof = acquired
      return acquired
    },
  }
  const daemon = await startDaemon({
    roots: {
      configRoot: '/tmp/ctxd-config',
      dataRoot: '/tmp/ctxd-data',
      stateRoot: '/tmp/ctxd-state',
      cacheRoot: '/tmp/ctxd-cache',
    },
    leaseBackend: leases,
    endpointRuntimeRoot: '/tmp/ctxd-runtime',
    hooks: {
      readMatchingMetadata: () => {
        events.push('read:metadata')
        return null
      },
      assertDatabaseTarget: () => {
        events.push('assert:database')
      },
      readConfig: async () => {
        events.push('config')
        return {} as never
      },
      readInstalled: async () => {
        events.push('installed')
        return { records: [], diagnostics: [] }
      },
      loadExtensions: async ({ localOAuthAppIdentities }) => {
        events.push(`identities:${localOAuthAppIdentities.length}`)
        events.push('extensions')
        return {
          registry: {} as never,
          completeRegistry: {} as never,
          diagnostics: [],
          documentation: {
            list: () => [
              {
                extensionId: 'fixture.docs',
                path: 'README.md',
                origin: 'authored' as const,
                kind: 'markdown' as const,
                mediaType: 'text/markdown' as const,
                content: '# Fixture',
              },
            ],
            get: () => ({
              extensionId: 'fixture.docs',
              path: 'README.md',
              origin: 'authored' as const,
              kind: 'markdown' as const,
              mediaType: 'text/markdown' as const,
              content: '# Fixture',
            }),
          },
        }
      },
      openDatabase: async () => {
        events.push('open')
        return { close: () => events.push('close:db') } as never
      },
      runMigrations: async () => {
        events.push('migrate')
      },
      listLocalOAuthAppIdentities: () => [],
      composeServices: () => {
        events.push('compose')
        return {
          syncService: {
            run: async () => ({ mode: 'sync', results: [], warnings: [] }),
          },
          sourceService: {
            resolveSourceId: (value: string) => value,
            getStatus: () => [],
          },
        }
      },
      bind: () => {
        events.push('bind')
        return {
          stop: () => {
            events.push('close:listener')
          },
        }
      },
      writeMetadata: (_root, metadata) =>
        events.push(`metadata:${metadata.lifecycle}`),
      cleanupMetadata: (_root, _owner, proof) => {
        if (!lifecycleProof) throw new Error('missing lifecycle proof')
        expect(proof).toBe(lifecycleProof)
        events.push('cleanup:metadata')
        return 'removed'
      },
      removeEndpoint: () => events.push('cleanup:endpoint'),
    },
  })
  expect(events).toEqual([
    'read:metadata',
    'lease:lifecycle',
    'lease:database',
    'read:metadata',
    'metadata:starting',
    'config',
    'installed',
    'assert:database',
    'open',
    'assert:database',
    'migrate',
    'identities:0',
    'extensions',
    'compose',
    'cleanup:endpoint',
    'bind',
    'metadata:ready',
  ])
  expect(
    (await daemon.application.system.health({}, daemon.testContext())).ok,
  ).toBe(true)
  expect(
    await daemon.application.documentation.get(
      { extensionId: 'fixture.docs', path: 'README.md' },
      daemon.testContext(),
    ),
  ).toMatchObject({
    ok: true,
    value: { item: { content: '# Fixture' } },
  })
  expect(await daemon.close(100)).toEqual({ status: 'complete' })
  expect(events.slice(-7)).toEqual([
    'metadata:stopping',
    'close:db',
    'close:listener',
    'cleanup:metadata',
    'cleanup:endpoint',
    'release:database',
    'release:lifecycle',
  ])
  expect(events.at(-1)).toBe('release:lifecycle')
})

test.each([
  'regular',
  'symlink',
] as const)('startup fails closed on an unsafe %s endpoint', async (kind) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-unsafe-endpoint-'))
  const runtimeRoot = `/tmp/ctxd-unsafe-${process.pid}-${kind}`
  const roots = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 })
  await chmod(runtimeRoot, 0o700)
  const runtime = resolveRuntimeIdentity(roots)
  const endpoint = resolveEndpoint(runtime.identity, { runtimeRoot }).path
  const target = join(runtimeRoot, `${kind}-target`)
  try {
    await writeFile(target, 'unsafe')
    if (kind === 'regular') await writeFile(endpoint, 'unsafe')
    else await symlink(target, endpoint)
    await expect(
      startDaemon({
        roots,
        endpointRuntimeRoot: runtimeRoot,
        leaseBackend: {
          acquire: (input) => lease(input.purpose, []),
        },
        hooks: {
          readMatchingMetadata: () => null,
          assertDatabaseTarget: () => {},
          readConfig: async () => ({}) as never,
          readInstalled: async () => ({ records: [], diagnostics: [] }),
          loadExtensions: async () => ({
            registry: {} as never,
            completeRegistry: {} as never,
            diagnostics: [],
            documentation: emptyDocumentation,
          }),
          openDatabase: async () => ({ close: () => {} }) as never,
          runMigrations: async () => {},
          listLocalOAuthAppIdentities: () => [],
          composeServices: () => ({
            syncService: {
              run: async () => ({
                mode: 'sync' as const,
                results: [],
                warnings: [],
              }),
            },
            sourceService: {
              resolveSourceId: (value: string) => value,
              getStatus: () => [],
            },
          }),
          bind: () => {
            throw new Error('unsafe endpoint reached bind')
          },
          writeMetadata: () => {},
          cleanupMetadata: () => 'removed',
        },
      }),
    ).rejects.toThrow('endpoint is unsafe')
    const remaining = await lstat(endpoint)
    expect(
      kind === 'regular' ? remaining.isFile() : remaining.isSymbolicLink(),
    ).toBe(true)
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true })
    await rm(sandbox, { recursive: true, force: true })
  }
})

test('startup rejects an Extension OAuth App that collides with persisted local identity', async () => {
  const sandbox = await mkdtemp(
    join(tmpdir(), 'ctxindex-daemon-app-collision-'),
  )
  const roots = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  await mkdir(roots.dataRoot, { recursive: true })
  try {
    await expect(
      startDaemon({
        roots,
        endpointRuntimeRoot: `/tmp/ctxd-app-${process.pid}`,
        leaseBackend: {
          acquire: (input) => lease(input.purpose, []),
        },
        hooks: {
          readMatchingMetadata: () => null,
          assertDatabaseTarget: () => {},
          readConfig: async () => defaultConfig(),
          readInstalled: async () => ({ records: [], diagnostics: [] }),
          openDatabase,
          runMigrations: async (database) => {
            await runMigrations(database)
            database
              .prepare(
                'INSERT INTO oauth_apps (provider_id, label, config_ref, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
              )
              .run('google', 'desktop', 'file:fixture')
          },
          loadExtensions: (input) =>
            loadExtensions({
              ...input,
              builtins: {
                collision: {
                  kind: 'extension',
                  id: 'fixture.oauth-app-collision',
                  providers: [],
                  oauthApps: [
                    {
                      kind: 'oauth-app',
                      provider: googleOAuthProvider,
                      label: 'desktop',
                      config: { clientId: 'public-client' },
                    },
                  ],
                  profiles: [],
                  adapters: [],
                },
              } as never,
            }),
          writeMetadata: () => {},
          cleanupMetadata: () => 'removed',
          removeEndpoint: () => {},
        },
      }),
    ).rejects.toThrow('Duplicate OAuth App')
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
})

test('a lifecycle-lease loser cannot remove the live daemon endpoint or discovery', async () => {
  let lifecycleHeld = false
  let endpointPresent = false
  let discoveryLifecycle: 'starting' | 'ready' | 'stopping' | null = null
  const backend: FileLeaseBackend = {
    acquire(input) {
      if (input.purpose === 'lifecycle') {
        if (lifecycleHeld) throw new FileLeaseConflictError('a'.repeat(64))
        lifecycleHeld = true
      }
      return {
        mode: 'exclusive',
        targetDigest: 'a'.repeat(64),
        release() {
          if (input.purpose === 'lifecycle') lifecycleHeld = false
        },
      }
    },
  }
  const hooks = {
    readMatchingMetadata: () => null,
    assertDatabaseTarget: () => {},
    readConfig: async () => ({}) as never,
    readInstalled: async () => ({ records: [], diagnostics: [] }),
    loadExtensions: async () => ({
      registry: {} as never,
      completeRegistry: {} as never,
      diagnostics: [],
      documentation: emptyDocumentation,
    }),
    openDatabase: async () => ({ close: () => {} }) as never,
    runMigrations: async () => {},
    listLocalOAuthAppIdentities: () => [],
    composeServices: () => ({
      syncService: {
        run: async () => ({ mode: 'sync' as const, results: [], warnings: [] }),
      },
      sourceService: {
        resolveSourceId: (value: string) => value,
        getStatus: () => [],
      },
    }),
    bind: () => {
      endpointPresent = true
      return { stop: () => {} }
    },
    writeMetadata: (
      _root: string,
      metadata: { lifecycle: typeof discoveryLifecycle },
    ) => {
      discoveryLifecycle = metadata.lifecycle
    },
    cleanupMetadata: () => {
      discoveryLifecycle = null
      return 'removed' as const
    },
    removeEndpoint: () => {
      endpointPresent = false
    },
  }
  const options = {
    roots: {
      configRoot: '/tmp/ctxd-owner-config',
      dataRoot: '/tmp/ctxd-owner-data',
      stateRoot: '/tmp/ctxd-owner-state',
      cacheRoot: '/tmp/ctxd-owner-cache',
    },
    endpointRuntimeRoot: '/tmp/ctxd-owner-runtime',
    leaseBackend: backend,
    hooks,
  } satisfies StartDaemonOptions
  const live = await startDaemon(options)
  expect(endpointPresent).toBe(true)
  expect(String(discoveryLifecycle)).toBe('ready')

  await expect(startDaemon(options)).rejects.toBeInstanceOf(
    FileLeaseConflictError,
  )
  expect(endpointPresent).toBe(true)
  expect(String(discoveryLifecycle)).toBe('ready')
  const health = await live.application.system.health({}, live.testContext())
  expect(health.ok && health.value.ready).toBe(true)
  await live.close(100)
})

test('non-cooperative request times out while ownership remains, then cleans up on settlement', async () => {
  const events: string[] = []
  let settle!: () => void
  const daemon = await startDaemon({
    roots: {
      configRoot: '/tmp/ctxd2-config',
      dataRoot: '/tmp/ctxd2-data',
      stateRoot: '/tmp/ctxd2-state',
      cacheRoot: '/tmp/ctxd2-cache',
    },
    leaseBackend: { acquire: (input) => lease(input.purpose, events) },
    endpointRuntimeRoot: '/tmp/ctxd2-runtime',
    observationTimeoutMs: 5,
    hooks: {
      readMatchingMetadata: () => null,
      assertDatabaseTarget: () => {},
      readConfig: async () => ({}) as never,
      readInstalled: async () => ({ records: [], diagnostics: [] }),
      loadExtensions: async () => ({
        registry: {} as never,
        completeRegistry: {} as never,
        diagnostics: [],
        documentation: emptyDocumentation,
      }),
      openDatabase: async () =>
        ({ close: () => events.push('close:db') }) as never,
      runMigrations: async () => {},
      listLocalOAuthAppIdentities: () => [],
      composeServices: () => ({
        syncService: {
          run: () =>
            new Promise((resolve) => {
              settle = () =>
                resolve({ mode: 'sync', results: [], warnings: [] })
            }),
        },
        sourceService: {
          resolveSourceId: (value: string) => value,
          getStatus: () => [],
        },
      }),
      bind: () => ({
        stop: () => {
          events.push('close:listener')
        },
      }),
      writeMetadata: () => {},
      cleanupMetadata: () => 'removed',
      removeEndpoint: () => {},
    },
  })
  const pending = daemon.application.sync.run(
    { mode: 'sync' },
    daemon.testContext(),
  )
  await Promise.resolve()
  expect(await daemon.close(5)).toEqual({
    status: 'timeout',
    instanceId: daemon.instanceId,
    timeoutMs: 5,
  })
  expect(events).toEqual([])
  settle()
  await pending
  await daemon.closed
  expect(events).toContain('close:db')
  expect(events).toContain('release:database')
  expect(events).toContain('release:lifecycle')
})

test('startup rollback closes opened resources and releases both leases', async () => {
  const events: string[] = []
  await expect(
    startDaemon({
      roots: {
        configRoot: '/tmp/ctxd3-config',
        dataRoot: '/tmp/ctxd3-data',
        stateRoot: '/tmp/ctxd3-state',
        cacheRoot: '/tmp/ctxd3-cache',
      },
      leaseBackend: { acquire: (input) => lease(input.purpose, events) },
      endpointRuntimeRoot: '/tmp/ctxd3-runtime',
      hooks: {
        readMatchingMetadata: () => null,
        assertDatabaseTarget: () => {},
        readConfig: async () => ({}) as never,
        loadExtensions: async () => ({
          registry: {} as never,
          completeRegistry: {} as never,
          diagnostics: [],
          documentation: emptyDocumentation,
        }),
        openDatabase: async () =>
          ({ close: () => events.push('close:db') }) as never,
        runMigrations: async () => {
          events.push('migrate')
          throw new Error('migration failed')
        },
        listLocalOAuthAppIdentities: () => [],
        writeMetadata: () => {
          events.push('metadata:starting')
        },
        cleanupMetadata: () => {
          events.push('cleanup:metadata')
          return 'removed'
        },
        removeEndpoint: () => {
          events.push('cleanup:endpoint')
        },
      },
    }),
  ).rejects.toThrow('migration failed')
  expect(events).toEqual([
    'metadata:starting',
    'migrate',
    'close:db',
    'cleanup:metadata',
    'cleanup:endpoint',
    'release:database',
    'release:lifecycle',
  ])
})

test('post-open database target assertion closes SQLite before rollback', async () => {
  const events: string[] = []
  let assertions = 0
  await expect(
    startDaemon({
      roots: {
        configRoot: '/tmp/ctxd4-config',
        dataRoot: '/tmp/ctxd4-data',
        stateRoot: '/tmp/ctxd4-state',
        cacheRoot: '/tmp/ctxd4-cache',
      },
      leaseBackend: { acquire: (input) => lease(input.purpose, events) },
      endpointRuntimeRoot: '/tmp/ctxd4-runtime',
      hooks: {
        readMatchingMetadata: () => null,
        assertDatabaseTarget: () => {
          assertions += 1
          events.push(`assert:${assertions}`)
          if (assertions === 2) throw new Error('database target changed')
        },
        readConfig: async () => ({}) as never,
        readInstalled: async () => ({ records: [], diagnostics: [] }),
        loadExtensions: async () => ({
          registry: {} as never,
          completeRegistry: {} as never,
          diagnostics: [],
          documentation: emptyDocumentation,
        }),
        openDatabase: async () => {
          events.push('open')
          return { close: () => events.push('close:db') } as never
        },
        runMigrations: async () => {
          events.push('migrate')
        },
        listLocalOAuthAppIdentities: () => [],
        writeMetadata: () => {},
        cleanupMetadata: () => 'removed',
        removeEndpoint: () => {},
      },
    }),
  ).rejects.toThrow('database target changed')
  expect(events).toEqual([
    'assert:1',
    'open',
    'assert:2',
    'close:db',
    'release:database',
    'release:lifecycle',
  ])
  expect(events).not.toContain('migrate')
})

test('daemon startup loads local Extensions without network acquisition', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-daemon-offline-'))
  const roots = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  const runtimeRoot = `/tmp/ctxd-offline-${process.pid}`
  await Promise.all(
    Object.values(roots).map((path) => mkdir(path, { recursive: true })),
  )
  const originalFetch = globalThis.fetch
  let networkCalls = 0
  globalThis.fetch = (() => {
    networkCalls += 1
    throw new Error('network forbidden during daemon startup')
  }) as unknown as typeof fetch
  try {
    const daemon = await startDaemon({
      roots,
      leaseBackend: { acquire: (input) => lease(input.purpose, []) },
      endpointRuntimeRoot: runtimeRoot,
      hooks: {
        readMatchingMetadata: () => null,
        assertDatabaseTarget: () => {},
        readConfig: async () => defaultConfig(),
        readInstalled: async () => ({ records: [], diagnostics: [] }),
        openDatabase: async () => ({ close: () => {} }) as never,
        runMigrations: async () => {},
        listLocalOAuthAppIdentities: () => [],
        composeServices: () => ({
          syncService: {
            run: async () => ({ mode: 'sync', results: [], warnings: [] }),
          },
          sourceService: {
            resolveSourceId: (value: string) => value,
            getStatus: () => [],
          },
        }),
        bind: () => ({ stop: () => {} }),
        writeMetadata: () => {},
        cleanupMetadata: () => 'removed',
        removeEndpoint: () => {},
      },
    })
    expect(networkCalls).toBe(0)
    await daemon.close(100)
  } finally {
    globalThis.fetch = originalFetch
    await rm(sandbox, { recursive: true, force: true })
    await rm(runtimeRoot, { recursive: true, force: true })
  }
})

test('daemon startup fails managed loading closed for an invalid record document', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-daemon-direct-'))
  const roots = {
    configRoot: join(sandbox, 'config'),
    dataRoot: join(sandbox, 'data'),
    stateRoot: join(sandbox, 'state'),
    cacheRoot: join(sandbox, 'cache'),
  }
  const runtimeRoot = `/tmp/ctxd-direct-${process.pid}`
  await Promise.all(
    Object.values(roots).map((path) => mkdir(path, { recursive: true })),
  )
  await writeFile(
    join(roots.configRoot, 'direct-extensions.json'),
    JSON.stringify({
      schema_version: 1,
      extensions: [
        {
          id: 'example.direct',
          source: {
            kind: 'npm',
            requested_target: '@example/direct@^1',
            package: '@example/direct',
            exact_version: '1.2.3',
          },
          dependency_resolution: {
            format: 'bun.lock@1.3.14',
            digest: 'b'.repeat(64),
          },
          materialization_digest: 'a'.repeat(64),
          package_root: 'node_modules/@example/direct',
          installed_at: 10,
          updated_at: 20,
        },
        {},
      ],
    }),
  )
  try {
    const daemon = await startDaemon({
      roots,
      leaseBackend: { acquire: (input) => lease(input.purpose, []) },
      endpointRuntimeRoot: runtimeRoot,
      hooks: {
        readMatchingMetadata: () => null,
        assertDatabaseTarget: () => {},
        readConfig: async () => defaultConfig(),
        openDatabase: async () => ({ close: () => {} }) as never,
        runMigrations: async () => {},
        listLocalOAuthAppIdentities: () => [],
        composeServices: () => ({
          syncService: {
            run: async () => ({ mode: 'sync', results: [], warnings: [] }),
          },
          sourceService: {
            resolveSourceId: (value: string) => value,
            getStatus: () => [],
          },
        }),
        bind: () => ({ stop: () => {} }),
        writeMetadata: () => {},
        cleanupMetadata: () => 'removed',
        removeEndpoint: () => {},
      },
    })
    const health = await daemon.application.system.health(
      {},
      daemon.testContext(),
    )
    expect(health).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({ extensionDiagnosticsCount: 1 }),
      }),
    )
    await daemon.close(100)
  } finally {
    await rm(sandbox, { recursive: true, force: true })
    await rm(runtimeRoot, { recursive: true, force: true })
  }
})
