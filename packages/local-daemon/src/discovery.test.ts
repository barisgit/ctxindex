import { afterEach, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  type readSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  cleanupDiscoveryMetadata,
  type DiscoveryMetadata,
  discoveryMetadataPath,
  endpointToken,
  parseDiscoveryMetadata,
  readDiscoveryMetadata,
  readMatchingDiscoveryMetadata,
  resolveEndpoint,
  writeDiscoveryMetadata,
} from './discovery'
import { resolveRuntimeIdentity } from './identity'
import type { FileLease, FileLeaseRequest } from './lease'

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0))
    rmSync(path, { force: true, recursive: true })
})

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'ctxindex-local-daemon-'))
  const canonical = realpathSync(path)
  cleanup.push(canonical)
  return canonical
}

const activeTestLeases = new WeakSet<FileLease>()

function lifecycleLease(_stateRoot: string): FileLease {
  const lease: FileLease = {
    mode: 'exclusive',
    targetDigest: 'a'.repeat(64),
    release: () => activeTestLeases.delete(lease),
  }
  activeTestLeases.add(lease)
  return lease
}

function assertLifecycleLease(
  lease: FileLease,
  expected: FileLeaseRequest,
): void {
  if (
    !activeTestLeases.has(lease) ||
    expected.purpose !== 'lifecycle' ||
    expected.mode !== 'exclusive'
  ) {
    throw new Error('Cleanup requires the matching retained lifecycle lease')
  }
}

function fixture(root: string): DiscoveryMetadata {
  const runtime = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  })
  return {
    schemaVersion: 1,
    protocolId: 'ctxindex.local',
    protocolVersion: 1,
    ...runtime.identity,
    instanceId: 'instance-1',
    ownerToken: 'a'.repeat(64),
    pid: 123,
    startedAt: '2026-07-18T00:00:00.000Z',
    lifecycle: 'ready',
    endpointToken: endpointToken(runtime.identity),
  }
}

test('derives a short endpoint under a current-user private runtime root with override parity', () => {
  const root = temporaryDirectory()
  const runtimeRoot = mkdtempSync('/tmp/ctxindex-run-')
  cleanup.push(runtimeRoot)
  const metadata = fixture(root)
  const identity = {
    tupleDigest: metadata.tupleDigest,
    configDigest: metadata.configDigest,
    dataDigest: metadata.dataDigest,
    stateDigest: metadata.stateDigest,
    cacheDigest: metadata.cacheDigest,
    databaseDigest: metadata.databaseDigest,
  }
  const daemon = resolveEndpoint(identity, { runtimeRoot })
  const client = resolveEndpoint(identity, { runtimeRoot })

  expect(client).toEqual(daemon)
  expect(Buffer.byteLength(daemon.path)).toBeLessThanOrEqual(103)
  expect(lstatSync(runtimeRoot).mode & 0o777).toBe(0o700)
  expect(daemon.path).toBe(join(daemon.runtimeRoot, daemon.token))
})

test('writes and reads bounded owner-private discovery metadata without raw roots', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)

  expect(readDiscoveryMetadata(stateRoot)).toEqual(metadata)
  expect(lstatSync(discoveryMetadataPath(stateRoot)).mode & 0o777).toBe(0o600)
  expect(lstatSync(join(stateRoot, 'daemon')).mode & 0o777).toBe(0o700)
  expect(readFileSync(discoveryMetadataPath(stateRoot), 'utf8')).not.toContain(
    root,
  )
})

test('reads metadata from one no-follow descriptor even when its pathname is replaced', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  const replacement = {
    ...metadata,
    instanceId: 'instance-2',
    ownerToken: 'b'.repeat(64),
  }
  writeDiscoveryMetadata(stateRoot, metadata)
  const path = discoveryMetadataPath(stateRoot)
  let replaced = false
  const replacingOpen: typeof openSync = (openPath, flags, mode) => {
    const fd = openSync(openPath, flags, mode)
    if (!replaced) {
      replaced = true
      renameSync(path, `${path}.old`)
      writeDiscoveryMetadata(stateRoot, replacement)
    }
    return fd
  }

  expect(readDiscoveryMetadata(stateRoot, { openFile: replacingOpen })).toEqual(
    metadata,
  )
  expect(readDiscoveryMetadata(stateRoot)).toEqual(replacement)
})

test('retries when an atomically replaced discovery descriptor is unlinked before stat', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  const replacement = {
    ...metadata,
    instanceId: 'instance-2',
    ownerToken: 'b'.repeat(64),
  }
  writeDiscoveryMetadata(stateRoot, metadata)
  let replaced = false
  const replacingOpen: typeof openSync = (path, flags, mode) => {
    const fd = openSync(path, flags, mode)
    if (!replaced) {
      replaced = true
      writeDiscoveryMetadata(stateRoot, replacement)
    }
    return fd
  }

  expect(readDiscoveryMetadata(stateRoot, { openFile: replacingOpen })).toEqual(
    replacement,
  )
})

test('rejects metadata that grows beyond the bound after descriptor stat', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)
  const growingRead = ((...args: unknown[]) => {
    const buffer = args[1] as Buffer
    const offset = typeof args[2] === 'number' ? args[2] : 0
    const length = typeof args[3] === 'number' ? args[3] : buffer.byteLength
    buffer.fill(0x78, offset, offset + length)
    return length
  }) as typeof readSync

  expect(() =>
    readDiscoveryMetadata(stateRoot, { readBytes: growingRead }),
  ).toThrow(/oversized/i)
})

test('rejects unknown, oversized, malformed, and unsafe endpoint metadata', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)

  expect(() => parseDiscoveryMetadata({ ...metadata, unknown: true })).toThrow(
    /unknown/i,
  )
  expect(() =>
    parseDiscoveryMetadata({ ...metadata, instanceId: 'x'.repeat(129) }),
  ).toThrow(/instanceId/i)
  expect(() => parseDiscoveryMetadata({ ...metadata, pid: 0 })).toThrow(/pid/i)
  expect(() =>
    parseDiscoveryMetadata({ ...metadata, endpointToken: '../escape.sock' }),
  ).toThrow(/endpointToken/i)
})

test('cleanup removes only matching owner metadata and rejects non-private files', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)
  const lease = lifecycleLease(stateRoot)

  expect(
    cleanupDiscoveryMetadata(
      stateRoot,
      {
        instanceId: metadata.instanceId,
        ownerToken: 'b'.repeat(64),
      },
      lease,
      { assertLease: assertLifecycleLease },
    ),
  ).toBe('not_owner')
  expect(existsSync(discoveryMetadataPath(stateRoot))).toBe(true)
  expect(
    cleanupDiscoveryMetadata(
      stateRoot,
      {
        instanceId: metadata.instanceId,
        ownerToken: metadata.ownerToken,
      },
      lease,
      { assertLease: assertLifecycleLease },
    ),
  ).toBe('removed')
  expect(existsSync(discoveryMetadataPath(stateRoot))).toBe(false)

  mkdirSync(join(stateRoot, 'daemon'), { recursive: true, mode: 0o700 })
  writeDiscoveryMetadata(stateRoot, metadata)
  chmodSync(discoveryMetadataPath(stateRoot), 0o644)
  expect(() => readDiscoveryMetadata(stateRoot)).toThrow(/private/i)
  lease.release()
})

test('cleanup requires a live matching retained lifecycle lease', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)
  const lease = lifecycleLease(stateRoot)
  lease.release()

  expect(() =>
    cleanupDiscoveryMetadata(
      stateRoot,
      {
        instanceId: metadata.instanceId,
        ownerToken: metadata.ownerToken,
      },
      lease,
      { assertLease: assertLifecycleLease },
    ),
  ).toThrow(/retained lifecycle lease/i)
  expect(existsSync(discoveryMetadataPath(stateRoot))).toBe(true)
})

test('old cleanup cannot remove metadata replaced by a new owner', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  const replacement = {
    ...metadata,
    instanceId: 'instance-2',
    ownerToken: 'b'.repeat(64),
  }
  writeDiscoveryMetadata(stateRoot, metadata)
  const lease = lifecycleLease(stateRoot)
  let openCount = 0
  const replaceBeforeFinalOpen: typeof openSync = (openPath, flags, mode) => {
    openCount += 1
    if (openCount === 2) writeDiscoveryMetadata(stateRoot, replacement)
    return openSync(openPath, flags, mode)
  }

  expect(
    cleanupDiscoveryMetadata(
      stateRoot,
      { instanceId: metadata.instanceId, ownerToken: metadata.ownerToken },
      lease,
      { openFile: replaceBeforeFinalOpen, assertLease: assertLifecycleLease },
    ),
  ).toBe('not_owner')
  expect(readDiscoveryMetadata(stateRoot)).toEqual(replacement)
  lease.release()
})

test('old cleanup cannot unlink a renamed substitute with the same owner fields', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)
  const lease = lifecycleLease(stateRoot)
  const path = discoveryMetadataPath(stateRoot)
  let openCount = 0
  const replaceBeforeFinalOpen: typeof openSync = (openPath, flags, mode) => {
    openCount += 1
    if (openCount === 2) {
      renameSync(path, `${path}.old`)
      writeDiscoveryMetadata(stateRoot, metadata)
    }
    return openSync(openPath, flags, mode)
  }

  expect(
    cleanupDiscoveryMetadata(
      stateRoot,
      { instanceId: metadata.instanceId, ownerToken: metadata.ownerToken },
      lease,
      { openFile: replaceBeforeFinalOpen, assertLease: assertLifecycleLease },
    ),
  ).toBe('not_owner')
  expect(existsSync(path)).toBe(true)
  lease.release()
})

test('exact-tuple discovery rejects the same state root with a different data root', () => {
  const root = temporaryDirectory()
  const metadata = fixture(root)
  const stateRoot = join(root, 'state')
  writeDiscoveryMetadata(stateRoot, metadata)

  const differentData = resolveRuntimeIdentity({
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'different-data'),
    stateRoot,
    cacheRoot: join(root, 'cache'),
  })
  expect(() =>
    readMatchingDiscoveryMetadata(stateRoot, differentData.identity),
  ).toThrow(/runtime identity/i)
})
