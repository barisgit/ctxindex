import { randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  type Stats,
  writeFileSync,
} from 'node:fs'
import { userInfo } from 'node:os'
import { join } from 'node:path'
import type { RuntimeIdentity } from './identity'
import { canonicalizePath } from './identity'
import { assertRetainedFileLease, type FileLease } from './lease'

const digestPattern = /^[a-f0-9]{64}$/
const endpointTokenPattern = /^ctxd-[a-f0-9]{24}\.sock$/
const ownerTokenPattern = /^[a-f0-9]{64}$/
const rfc3339Pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const metadataKeys = new Set([
  'schemaVersion',
  'protocolId',
  'protocolVersion',
  'tupleDigest',
  'configDigest',
  'dataDigest',
  'stateDigest',
  'cacheDigest',
  'databaseDigest',
  'instanceId',
  'ownerToken',
  'pid',
  'startedAt',
  'lifecycle',
  'endpointToken',
])

export type DaemonLifecycleState = 'starting' | 'ready' | 'stopping'

export interface DiscoveryMetadata extends RuntimeIdentity {
  readonly schemaVersion: 1
  readonly protocolId: 'ctxindex.local'
  readonly protocolVersion: number
  readonly instanceId: string
  readonly ownerToken: string
  readonly pid: number
  readonly startedAt: string
  readonly lifecycle: DaemonLifecycleState
  readonly endpointToken: string
}

export interface EndpointResolutionOptions {
  readonly runtimeRoot?: string
}

export interface DiscoveryReadOptions {
  readonly openFile?: typeof openSync
  readonly readBytes?: typeof readSync
}

export interface DiscoveryCleanupOptions extends DiscoveryReadOptions {
  readonly assertLease?: typeof assertRetainedFileLease
}

export interface ResolvedEndpoint {
  readonly runtimeRoot: string
  readonly token: string
  readonly path: string
}

export class RuntimeIdentityMismatchError extends Error {
  constructor() {
    super('Discovery metadata does not match the canonical runtime identity')
    this.name = 'RuntimeIdentityMismatchError'
  }
}

function validateOwnedPrivateFile(stat: Stats): void {
  if (stat.isSymbolicLink())
    throw new Error('Discovery metadata must not be a symlink')
  if (!stat.isFile())
    throw new Error('Discovery metadata must be a regular file')
  if (stat.nlink !== 1)
    throw new Error('Discovery metadata must not be hard-linked')
  if (stat.uid !== userInfo().uid) {
    throw new Error('Discovery metadata must be owned by the current user')
  }
  if ((stat.mode & 0o777) !== 0o600)
    throw new Error('Discovery metadata must be private mode 0600')
}

interface OpenDiscoveryMetadata {
  readonly fd: number
  readonly stat: Stats
  readonly metadata: DiscoveryMetadata
}

function openDiscoveryMetadata(
  stateRoot: string,
  options: DiscoveryReadOptions = {},
): OpenDiscoveryMetadata | null {
  const path = discoveryMetadataPath(stateRoot)
  let fd: number
  try {
    fd = (options.openFile ?? openSync)(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }

  try {
    const stat = fstatSync(fd)
    validateOwnedPrivateFile(stat)
    if (stat.size > 8192) throw new Error('Discovery metadata is oversized')
    const buffer = Buffer.allocUnsafe(8193)
    const readBytes = options.readBytes ?? readSync
    let byteLength = 0
    while (byteLength < buffer.byteLength) {
      const count = readBytes(
        fd,
        buffer,
        byteLength,
        buffer.byteLength - byteLength,
        null,
      )
      if (count === 0) break
      byteLength += count
    }
    if (byteLength > 8192) throw new Error('Discovery metadata is oversized')
    const content = buffer.subarray(0, byteLength).toString('utf8')
    return {
      fd,
      stat,
      metadata: parseDiscoveryMetadata(JSON.parse(content) as unknown),
    }
  } catch (error) {
    closeSync(fd)
    throw error
  }
}

function ensurePrivateDirectory(input: string): string {
  const path = canonicalizePath(input)
  mkdirSync(path, { mode: 0o700, recursive: true })
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Runtime directory must be regular')
  if (stat.uid !== userInfo().uid) {
    throw new Error('Runtime directory must be owned by the current user')
  }
  if ((stat.mode & 0o777) !== 0o700)
    throw new Error('Runtime directory must be private mode 0700')
  return path
}

function requireBoundedString(
  value: unknown,
  name: string,
  maximumBytes: number,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    Buffer.byteLength(value, 'utf8') > maximumBytes
  ) {
    throw new Error(`${name} is invalid`)
  }
  return value
}

function requireDigest(value: unknown, name: string): string {
  const digest = requireBoundedString(value, name, 64)
  if (!digestPattern.test(digest)) throw new Error(`${name} is invalid`)
  return digest
}

export function createOwnerToken(): string {
  return randomBytes(32).toString('hex')
}

export function endpointToken(identity: RuntimeIdentity): string {
  if (!digestPattern.test(identity.tupleDigest))
    throw new Error('tupleDigest is invalid')
  return `ctxd-${identity.tupleDigest.slice(0, 24)}.sock`
}

export function resolveEndpoint(
  identity: RuntimeIdentity,
  options: EndpointResolutionOptions = {},
): ResolvedEndpoint {
  const requestedRoot = options.runtimeRoot ?? `/tmp/ctxindex-${userInfo().uid}`
  const runtimeRoot = ensurePrivateDirectory(requestedRoot)
  const token = endpointToken(identity)
  const path = join(runtimeRoot, token)
  if (Buffer.byteLength(path, 'utf8') > 103) {
    throw new Error(
      'Resolved Unix socket endpoint exceeds the supported path bound',
    )
  }
  return { runtimeRoot, token, path }
}

export function parseDiscoveryMetadata(input: unknown): DiscoveryMetadata {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Discovery metadata must be an object')
  }
  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!metadataKeys.has(key))
      throw new Error(`Discovery metadata contains unknown key: ${key}`)
  }
  for (const key of metadataKeys) {
    if (!(key in record))
      throw new Error(`Discovery metadata is missing ${key}`)
  }

  if (record.schemaVersion !== 1) throw new Error('schemaVersion is invalid')
  if (record.protocolId !== 'ctxindex.local')
    throw new Error('protocolId is invalid')
  if (
    !Number.isInteger(record.protocolVersion) ||
    Number(record.protocolVersion) < 1 ||
    Number(record.protocolVersion) > 65_535
  ) {
    throw new Error('protocolVersion is invalid')
  }
  const instanceId = requireBoundedString(record.instanceId, 'instanceId', 128)
  const ownerToken = requireBoundedString(record.ownerToken, 'ownerToken', 64)
  if (!ownerTokenPattern.test(ownerToken))
    throw new Error('ownerToken is invalid')
  if (
    !Number.isInteger(record.pid) ||
    Number(record.pid) < 1 ||
    Number(record.pid) > 2_147_483_647
  ) {
    throw new Error('pid is invalid')
  }
  const startedAt = requireBoundedString(record.startedAt, 'startedAt', 32)
  if (!rfc3339Pattern.test(startedAt) || Number.isNaN(Date.parse(startedAt))) {
    throw new Error('startedAt is invalid')
  }
  if (
    record.lifecycle !== 'starting' &&
    record.lifecycle !== 'ready' &&
    record.lifecycle !== 'stopping'
  ) {
    throw new Error('lifecycle is invalid')
  }
  const endpoint = requireBoundedString(
    record.endpointToken,
    'endpointToken',
    64,
  )
  if (!endpointTokenPattern.test(endpoint))
    throw new Error('endpointToken is invalid')

  return {
    schemaVersion: 1,
    protocolId: 'ctxindex.local',
    protocolVersion: Number(record.protocolVersion),
    tupleDigest: requireDigest(record.tupleDigest, 'tupleDigest'),
    configDigest: requireDigest(record.configDigest, 'configDigest'),
    dataDigest: requireDigest(record.dataDigest, 'dataDigest'),
    stateDigest: requireDigest(record.stateDigest, 'stateDigest'),
    cacheDigest: requireDigest(record.cacheDigest, 'cacheDigest'),
    databaseDigest: requireDigest(record.databaseDigest, 'databaseDigest'),
    instanceId,
    ownerToken,
    pid: Number(record.pid),
    startedAt,
    lifecycle: record.lifecycle,
    endpointToken: endpoint,
  }
}

export function discoveryMetadataPath(stateRoot: string): string {
  return join(canonicalizePath(stateRoot), 'daemon', 'discovery.json')
}

export function writeDiscoveryMetadata(
  stateRoot: string,
  input: DiscoveryMetadata,
): void {
  const metadata = parseDiscoveryMetadata(input)
  const directory = ensurePrivateDirectory(
    join(canonicalizePath(stateRoot), 'daemon'),
  )
  const path = join(directory, 'discovery.json')
  const temporary = join(directory, `.discovery-${createOwnerToken()}.tmp`)
  const serialized = `${JSON.stringify(metadata)}\n`
  if (Buffer.byteLength(serialized, 'utf8') > 8192)
    throw new Error('Discovery metadata is oversized')

  const fd = openSync(
    temporary,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fchmodSync(fd, 0o600)
    writeFileSync(fd, serialized, 'utf8')
    fsyncSync(fd)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error('Discovery metadata target is unsafe')
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  validateOwnedPrivateFile(lstatSync(path))
}

export function readDiscoveryMetadata(
  stateRoot: string,
  options: DiscoveryReadOptions = {},
): DiscoveryMetadata | null {
  const opened = openDiscoveryMetadata(stateRoot, options)
  if (opened === null) return null
  try {
    return opened.metadata
  } finally {
    closeSync(opened.fd)
  }
}

export function readMatchingDiscoveryMetadata(
  stateRoot: string,
  identity: RuntimeIdentity,
): DiscoveryMetadata | null {
  const metadata = readDiscoveryMetadata(stateRoot)
  if (metadata === null) return null
  for (const key of [
    'tupleDigest',
    'configDigest',
    'dataDigest',
    'stateDigest',
    'cacheDigest',
    'databaseDigest',
  ] as const) {
    if (metadata[key] !== identity[key])
      throw new RuntimeIdentityMismatchError()
  }
  if (metadata.endpointToken !== endpointToken(identity))
    throw new RuntimeIdentityMismatchError()
  return metadata
}

export type DiscoveryCleanupResult = 'removed' | 'not_owner' | 'missing'

export function cleanupDiscoveryMetadata(
  stateRoot: string,
  owner: Pick<DiscoveryMetadata, 'instanceId' | 'ownerToken'>,
  lifecycleLease: FileLease,
  options: DiscoveryCleanupOptions = {},
): DiscoveryCleanupResult {
  const canonicalStateRoot = canonicalizePath(stateRoot)
  const assertLease = options.assertLease ?? assertRetainedFileLease
  assertLease(lifecycleLease, {
    canonicalTarget: canonicalStateRoot,
    purpose: 'lifecycle',
    mode: 'exclusive',
  })
  const opened = openDiscoveryMetadata(canonicalStateRoot, options)
  if (opened === null) return 'missing'
  try {
    if (
      opened.metadata.instanceId !== owner.instanceId ||
      opened.metadata.ownerToken !== owner.ownerToken
    ) {
      return 'not_owner'
    }

    const final = openDiscoveryMetadata(canonicalStateRoot, options)
    if (final === null) return 'not_owner'
    try {
      const pathname = lstatSync(discoveryMetadataPath(canonicalStateRoot))
      validateOwnedPrivateFile(pathname)
      if (
        final.stat.dev !== opened.stat.dev ||
        final.stat.ino !== opened.stat.ino ||
        pathname.dev !== final.stat.dev ||
        pathname.ino !== final.stat.ino ||
        final.metadata.instanceId !== owner.instanceId ||
        final.metadata.ownerToken !== owner.ownerToken
      ) {
        return 'not_owner'
      }
    } finally {
      closeSync(final.fd)
    }
    rmSync(discoveryMetadataPath(canonicalStateRoot))
    return 'removed'
  } finally {
    closeSync(opened.fd)
  }
}
