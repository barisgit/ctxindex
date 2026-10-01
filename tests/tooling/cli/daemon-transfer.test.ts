import { afterEach, expect, spyOn, test } from 'bun:test'
import * as fsPromises from 'node:fs/promises'
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import type { ArtifactService } from '@ctxindex/core/artifact'
import { createDocumentationService } from '@ctxindex/core/documentation'
import { CtxindexError, CtxindexNotFoundError } from '@ctxindex/core/errors'
import { resolveRuntimeIdentity } from '@ctxindex/local-daemon'
import {
  type ArtifactCommandDeps,
  handleArtifactCommand,
} from '../../../apps/cli/src/artifact/handle-artifact-command'
import {
  type DaemonSelection,
  daemonArtifactDownload,
  daemonArtifactList,
  daemonArtifactPurge,
  daemonExport,
  daemonTransferBytes,
  daemonTransferToFile,
  selectDaemonForRuntime,
} from '../../../apps/cli/src/daemon/client'
import { handleExportCommand } from '../../../apps/cli/src/export/handle-export-command'
import {
  DaemonApplication,
  type DaemonApplicationOptions,
} from '../../../apps/daemon/src/application'
import { DAEMON_PROTOCOL } from '../../../apps/daemon/src/runtime'
import {
  type ByteTransferDescriptor,
  ByteTransferStore,
} from '../../../apps/daemon/src/transfer'
import { bindDaemonTransport } from '../../../apps/daemon/src/transport'

// Integrated daemon + CLI coverage for the Artifact/export byte-transfer
// boundary: a real DaemonApplication and Unix-socket transport, the real CLI
// daemon client, and the real CLI handlers. Only the core services behind the
// daemon are fakes, so every byte crosses the accepted ticket transport.

const originRef = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/message/one'
const artifactRef = `${originRef}/attachment/file`
const byteCanary = 'transfer-byte-canary'
const pathCanary = '/private/ctxindex-cache-root-canary'
const payload = new Uint8Array([
  0,
  255,
  ...new TextEncoder().encode(byteCanary),
])

const artifact = {
  ref: artifactRef,
  originRef,
  contentHash: `sha256:${'c'.repeat(64)}`,
  mediaType: 'application/octet-stream',
  byteSize: payload.byteLength,
  retentionClass: 'cached' as const,
  createdAt: 1,
}
const listed = {
  resourceRef: originRef,
  artifacts: [
    {
      ref: artifactRef,
      filename: 'file.bin',
      mediaType: 'application/octet-stream',
      byteSize: payload.byteLength,
    },
  ],
  warnings: [],
}
const purged = {
  artifactCountRemoved: 1,
  objectCountRemoved: 1,
  logicalBytesFreed: payload.byteLength,
  physicalBytesFreed: payload.byteLength,
  diskAccounting: {
    artifactCount: 0,
    objectCount: 0,
    logicalBytes: 0,
    physicalBytes: 0,
  },
}

type ArtifactFake = Pick<
  ArtifactService,
  'list' | 'download' | 'downloadForTransfer' | 'purge'
>

class RecordingStore extends ByteTransferStore {
  readonly created: ByteTransferDescriptor[] = []
  afterCreate: () => void = () => {}

  override create(bytes: Uint8Array): ByteTransferDescriptor {
    const descriptor = super.create(bytes)
    this.created.push(descriptor)
    this.afterCreate()
    return descriptor
  }
}

interface Harness {
  readonly root: string
  readonly outputs: string
  readonly selection: DaemonSelection
  readonly store: RecordingStore
  readonly rpcBodies: string[]
}

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function harness(
  services: Partial<DaemonApplicationOptions>,
  store = new RecordingStore(),
): Promise<Harness> {
  const root = await mkdtemp('/tmp/ctxi-transfer-')
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const outputs = join(root, 'outputs')
  await Bun.write(join(outputs, '.keep'), '')
  await rm(join(outputs, '.keep'))
  const runtime = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  })
  const endpoint = join(root, 'daemon.sock')
  const application = new DaemonApplication({
    protocol: DAEMON_PROTOCOL,
    runtime: runtime.identity,
    daemonVersion: '0.0.0',
    buildVersion: 'transfer-fixture',
    instanceId: 'transfer-daemon',
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
    transferStore: store,
    ...services,
  })
  application.markReady()
  const listener = bindDaemonTransport({
    endpoint,
    application,
    expectations: { protocol: DAEMON_PROTOCOL, runtime: runtime.identity },
    transferStore: store,
  })
  cleanups.push(() => listener.stop())
  const selection = selectDaemonForRuntime(runtime, { testEndpoint: endpoint })
  if (!selection) throw new Error('Expected explicit test endpoint')

  // Record every unary RPC response body so ordinary DTOs can be checked for
  // bytes and host paths; ticket GETs use the transfer adapter's own fetch.
  const rpcBodies: string[] = []
  const originalFetch = globalThis.fetch
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (
    input: Request | string | URL,
    init?: RequestInit,
  ) => {
    const response = await originalFetch(input, init)
    rpcBodies.push(await response.clone().text())
    return response
  }) as typeof fetch)
  cleanups.push(() => fetchSpy.mockRestore())
  return { root, outputs, selection, store, rpcBodies }
}

function artifactDeps(selection: DaemonSelection | null): ArtifactCommandDeps {
  return {
    select: () => selection,
    ensure: async () =>
      selection
        ? { status: 'selected', selection, started: false }
        : { status: 'unsupported' },
    list: daemonArtifactList,
    download: daemonArtifactDownload,
    transferToFile: daemonTransferToFile,
    purge: daemonArtifactPurge,
    open: async () => {
      throw new Error('a selected daemon route must not open direct state')
    },
  }
}

function captureConsole() {
  const stdout: string[] = []
  const stderr: string[] = []
  const log = spyOn(console, 'log').mockImplementation((value: unknown) => {
    stdout.push(String(value))
  })
  const error = spyOn(console, 'error').mockImplementation((value: unknown) => {
    stderr.push(String(value))
  })
  cleanups.push(() => {
    log.mockRestore()
    error.mockRestore()
  })
  return { stdout, stderr }
}

function expectSafeRpcBodies(bodies: readonly string[]) {
  expect(bodies.length).toBeGreaterThan(0)
  for (const body of bodies) {
    expect(body).not.toContain(byteCanary)
    expect(body).not.toContain(pathCanary)
    expect(body).not.toContain('localPath')
  }
}

async function expectTicketConsumed(h: Harness) {
  expect(h.store.created).toHaveLength(1)
  const [descriptor] = h.store.created
  if (!descriptor) throw new Error('Expected one transfer descriptor')
  await expect(
    daemonTransferBytes(h.selection, descriptor),
  ).rejects.toMatchObject({ code: 'daemon_unavailable' })
}

test('Artifact list, receipt, file download, and purge cross the daemon socket with safe metadata', async () => {
  const calls: string[] = []
  const h = await harness({
    artifactService: {
      list: async () => {
        calls.push('list')
        return listed
      },
      download: async () => {
        calls.push('download')
        return { artifact, cache: 'hit' }
      },
      downloadForTransfer: async (_ref, maxByteSize) => {
        calls.push(`downloadForTransfer:${maxByteSize}`)
        return { download: { artifact, cache: 'miss' }, bytes: payload }
      },
      purge: async () => {
        calls.push('purge')
        return purged
      },
    } satisfies ArtifactFake,
  })
  const output = captureConsole()
  const deps = artifactDeps(h.selection)
  const destination = join(h.outputs, 'file.bin')

  expect(
    await handleArtifactCommand(
      { kind: 'list', ref: originRef, format: 'json' },
      deps,
    ),
  ).toBe(0)
  expect(
    await handleArtifactCommand(
      { kind: 'download', ref: artifactRef, json: true },
      deps,
    ),
  ).toBe(0)
  expect(
    await handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      deps,
    ),
  ).toBe(0)
  expect(await handleArtifactCommand({ kind: 'purge', json: true }, deps)).toBe(
    0,
  )

  expect(calls).toEqual([
    'list',
    'download',
    `downloadForTransfer:${64 * 1024 * 1024}`,
    'purge',
  ])
  expect(output.stdout).toEqual([
    JSON.stringify(listed),
    JSON.stringify({ artifact, cache: 'hit' }),
    JSON.stringify({ artifact, cache: 'miss', outputPath: destination }),
    JSON.stringify(purged),
  ])
  expect(output.stderr).toEqual([])
  expect(new Uint8Array(await readFile(destination))).toEqual(payload)
  expect((await stat(destination)).mode & 0o777).toBe(0o600)
  expect(await readdir(h.outputs)).toEqual(['file.bin'])
  expectSafeRpcBodies(h.rpcBodies)
  await expectTicketConsumed(h)
})

test('export writes exact bytes to stdout through one consumed transfer ticket', async () => {
  const h = await harness({
    exportService: {
      prepare: async () => ({
        bytes: payload,
        mediaType: 'application/octet-stream',
        format: 'binary',
        ref: originRef,
        warnings: [
          {
            code: 'export_partial',
            message: 'Public warning.',
            ref: originRef,
          },
        ],
      }),
    },
  })
  const output = captureConsole()
  const written: Uint8Array[] = []
  const write = spyOn(process.stdout, 'write').mockImplementation(((
    chunk: Uint8Array,
  ) => {
    written.push(chunk)
    return true
  }) as typeof process.stdout.write)
  cleanups.push(() => write.mockRestore())

  expect(
    await handleExportCommand(
      { ref: originRef, format: 'binary' },
      {
        selectDaemon: () => h.selection,
        ensureDaemonSelection: async () => ({
          status: 'selected',
          selection: h.selection,
          started: false,
        }),
        export: daemonExport,
        open: async () => {
          throw new Error('a selected daemon route must not open direct state')
        },
        runExport: async () => {
          throw new Error('a selected daemon route must not export directly')
        },
      },
    ),
  ).toBe(0)

  expect(written).toHaveLength(1)
  expect(new Uint8Array(written[0] ?? [])).toEqual(payload)
  expect(output.stderr).toEqual(['export_partial\tPublic warning.'])
  expectSafeRpcBodies(h.rpcBodies)
  await expectTicketConsumed(h)
})

test('expired and consumed tickets fail bounded without creating output', async () => {
  let clock = 1_000
  const store = new RecordingStore({ ttlMs: 50, now: () => clock })
  const h = await harness(
    {
      artifactService: {
        downloadForTransfer: async () => ({
          download: { artifact, cache: 'miss' },
          bytes: payload,
        }),
      } as unknown as ArtifactFake,
    },
    store,
  )
  const output = captureConsole()
  const destination = join(h.outputs, 'expired.bin')
  // Expire the ticket between its RPC descriptor and the CLI's GET.
  store.afterCreate = () => {
    clock += 50
  }

  expect(
    await handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      artifactDeps(h.selection),
    ),
  ).toBe(50)
  expect(output.stdout).toEqual([])
  expect(await readdir(h.outputs)).toEqual([])

  store.afterCreate = () => {}
  const consumed = store.create(payload)
  expect(await daemonTransferBytes(h.selection, consumed)).toEqual(payload)
  await expect(
    daemonTransferToFile(h.selection, consumed, destination),
  ).rejects.toMatchObject({ code: 'daemon_unavailable' })
  expect(await readdir(h.outputs)).toEqual([])
})

test('an existing destination is never overwritten and leaves no staged bytes', async () => {
  const h = await harness({
    artifactService: {
      downloadForTransfer: async () => ({
        download: { artifact, cache: 'hit' },
        bytes: payload,
      }),
    } as unknown as ArtifactFake,
  })
  const output = captureConsole()
  const destination = join(h.outputs, 'existing.bin')
  await writeFile(destination, 'operator data')

  expect(
    await handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      artifactDeps(h.selection),
    ),
  ).toBe(2)
  expect(output.stdout).toEqual([])
  expect(output.stderr).toEqual([`Output path already exists: ${destination}`])
  expect(await readFile(destination, 'utf8')).toBe('operator data')
  expect(await readdir(h.outputs)).toEqual(['existing.bin'])
})

test('provider-stream failures and cancellation leave no partial output and keep direct exits', async () => {
  for (const failure of [
    new CtxindexError(`Provider stream failed at ${pathCanary}`, 'network'),
    new CtxindexError(
      `Artifact CAS unreadable: ${pathCanary}`,
      'data_integrity',
    ),
    new CtxindexError(`Unsupported at ${pathCanary}`, 'unsupported_capability'),
    new CtxindexError('Purge in progress', 'conflict'),
    new CtxindexNotFoundError(`Artifact descriptor not found: ${artifactRef}`),
  ]) {
    const throwing = async () => {
      throw failure
    }
    const h = await harness({
      artifactService: {
        download: throwing,
        downloadForTransfer: throwing,
      } as unknown as ArtifactFake,
    })
    const output = captureConsole()
    const destination = join(h.outputs, 'failed.bin')
    const directExit = await handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      {
        ...artifactDeps(null),
        open: async () => ({
          artifactService: { download: throwing } as unknown as ArtifactService,
          async close() {},
        }),
      },
    )
    const daemonExit = await handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      artifactDeps(h.selection),
    )

    expect(daemonExit, failure.message).toBe(directExit)
    expect(output.stdout).toEqual([])
    expect(output.stderr.at(-1)).not.toContain(pathCanary)
    expect(await readdir(h.outputs)).toEqual([])
    expect(h.store.created).toEqual([])
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  }

  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  let observedAbort = false
  const h = await harness({
    artifactService: {
      downloadForTransfer: (_ref, _max, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            observedAbort = true
            reject(signal.reason)
          })
          entered()
        }),
    } as unknown as ArtifactFake,
  })
  const output = captureConsole()
  const destination = join(h.outputs, 'cancelled.bin')
  const pending = handleArtifactCommand(
    { kind: 'download', ref: artifactRef, outputPath: destination, json: true },
    artifactDeps(h.selection),
  )
  await started
  process.emit('SIGINT')

  expect(await pending).toBe(130)
  expect(output.stdout).toEqual([])
  for (let attempt = 0; attempt < 100 && !observedAbort; attempt += 1)
    await Bun.sleep(10)
  expect(observedAbort).toBe(true)
  expect(await readdir(h.outputs)).toEqual([])
  expect(h.store.created).toEqual([])
})

async function partialBodyEndpoint(mode: 'truncate' | 'hang') {
  const root = await mkdtemp('/tmp/ctxi-partial-')
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const endpoint = join(root, 'partial.sock')
  let sent!: () => void
  const firstChunk = new Promise<void>((resolve) => {
    sent = resolve
  })
  const server = Bun.serve({
    unix: endpoint,
    fetch: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            controller.enqueue(payload.slice(0, 4))
            sent()
            if (mode === 'truncate') {
              // Ends before the declared length, like a daemon that exits
              // while serving the ticket.
              await Bun.sleep(10)
              controller.close()
            } else {
              await new Promise(() => {})
            }
          },
        }),
        { headers: { 'content-length': String(payload.byteLength) } },
      ),
  })
  cleanups.push(() => server.stop(true))
  const runtime = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  })
  const selection = selectDaemonForRuntime(runtime, { testEndpoint: endpoint })
  if (!selection) throw new Error('Expected explicit test endpoint')
  const outputs = join(root, 'outputs')
  await Bun.write(join(outputs, '.keep'), '')
  await rm(join(outputs, '.keep'))
  return { selection, outputs, firstChunk }
}

const partialDescriptor = {
  ticket: 'd'.repeat(64),
  byteSize: payload.byteLength,
  expiresAt: Number.MAX_SAFE_INTEGER,
}

test('a transfer body that fails mid-stream is a bounded integrity failure with no output', async () => {
  const partial = await partialBodyEndpoint('truncate')
  const destination = join(partial.outputs, 'partial.bin')
  const error = await daemonTransferToFile(
    partial.selection,
    partialDescriptor,
    destination,
  ).catch((value: unknown) => value)

  // The truncated body is rejected by the exact declared byte count.
  expect(error).toMatchObject({ code: 'data_integrity' })
  expect(await readdir(partial.outputs)).toEqual([])
})

test('cancellation during a transfer body read is bounded cancellation with no output', async () => {
  const partial = await partialBodyEndpoint('hang')
  const destination = join(partial.outputs, 'partial.bin')
  const controller = new AbortController()
  const pending = daemonTransferToFile(
    partial.selection,
    partialDescriptor,
    destination,
    controller.signal,
  ).catch((value: unknown) => value)
  await partial.firstChunk
  await Bun.sleep(10)
  controller.abort()

  expect(await pending).toMatchObject({ code: 'cancelled' })
  expect(await readdir(partial.outputs)).toEqual([])
})

// A barrier inside one staging step lets SIGINT land after the body was fully
// consumed but before (or just after) the destination link publishes it.
function stagingBarrier(
  step: 'writeFile' | 'chmod' | 'rm',
  matches: (path: string) => boolean = () => true,
) {
  let entered!: () => void
  let release!: () => void
  const reached = new Promise<void>((resolve) => {
    entered = resolve
  })
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  const originals = {
    writeFile: fsPromises.writeFile,
    chmod: fsPromises.chmod,
    rm: fsPromises.rm,
  }
  const original = originals[step] as (...args: unknown[]) => Promise<void>
  const spy = spyOn(fsPromises, step).mockImplementation((async (
    ...args: unknown[]
  ) => {
    if (matches(String(args[0]))) {
      entered()
      await released
    }
    return original(...args)
  }) as never)
  cleanups.push(() => spy.mockRestore())
  return { reached, release }
}

function transferringHarness() {
  return harness({
    artifactService: {
      downloadForTransfer: async () => ({
        download: { artifact, cache: 'miss' },
        bytes: payload,
      }),
    } as unknown as ArtifactFake,
  })
}

test('cancellation while staging a transferred file publishes nothing and reports cancelled', async () => {
  // writeFile receives the signal; chmod is the last step before the link,
  // so it proves the explicit pre-publication check.
  for (const step of ['writeFile', 'chmod'] as const) {
    const h = await transferringHarness()
    const barrier = stagingBarrier(step)
    const output = captureConsole()
    const destination = join(h.outputs, 'staged.bin')
    const pending = handleArtifactCommand(
      {
        kind: 'download',
        ref: artifactRef,
        outputPath: destination,
        json: true,
      },
      artifactDeps(h.selection),
    )
    await barrier.reached
    process.emit('SIGINT')
    barrier.release()

    expect(await pending, step).toBe(130)
    expect(output.stdout).toEqual([])
    expect(output.stderr).toEqual(['The daemon request was cancelled.'])
    expect(await readdir(h.outputs)).toEqual([])
    expect(h.store.created).toHaveLength(1)
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  }
})

test('a staging failure observed after cancellation reports cancelled, not the filesystem error', async () => {
  const h = await harness({})
  const descriptor = h.store.create(payload)
  const controller = new AbortController()
  const mkdtemp = spyOn(fsPromises, 'mkdtemp').mockImplementation((async () => {
    controller.abort()
    throw Object.assign(new Error('ENOENT: output directory removed'), {
      code: 'ENOENT',
    })
  }) as never)
  cleanups.push(() => mkdtemp.mockRestore())

  await expect(
    daemonTransferToFile(
      h.selection,
      descriptor,
      join(h.outputs, 'gone.bin'),
      controller.signal,
    ),
  ).rejects.toMatchObject({ code: 'cancelled' })
  expect(await readdir(h.outputs)).toEqual([])
})

test('cancellation after publication is not reported as a successful download', async () => {
  const h = await transferringHarness()
  const barrier = stagingBarrier('rm', (path) =>
    path.includes('.ctxindex-transfer-'),
  )
  const output = captureConsole()
  const destination = join(h.outputs, 'published.bin')
  const pending = handleArtifactCommand(
    { kind: 'download', ref: artifactRef, outputPath: destination, json: true },
    artifactDeps(h.selection),
  )
  await barrier.reached
  process.emit('SIGINT')
  barrier.release()

  expect(await pending).toBe(130)
  expect(output.stdout).toEqual([])
  expect(output.stderr).toEqual(['The daemon request was cancelled.'])
  // The link already published the complete file atomically; it is left in
  // place rather than deleted from an operator-owned path, but no success
  // receipt is reported and the staging directory is still removed.
  expect(await readdir(h.outputs)).toEqual(['published.bin'])
  expect(new Uint8Array(await readFile(destination))).toEqual(payload)
})

test('a transfer GET from a mismatched runtime is rejected without consuming the ticket', async () => {
  const h = await harness({})
  const descriptor = h.store.create(payload)
  const mismatched: DaemonSelection = {
    ...h.selection,
    roots: {
      ...h.selection.roots,
      identity: {
        ...h.selection.roots.identity,
        databaseDigest: 'f'.repeat(64),
      },
    },
  }

  await expect(
    daemonTransferBytes(mismatched, descriptor),
  ).rejects.toMatchObject({ code: 'runtime_identity_mismatch' })
  expect(await daemonTransferBytes(h.selection, descriptor)).toEqual(payload)
})
