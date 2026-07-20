import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  type Stats,
} from 'node:fs'
import { platform, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { canonicalizePath } from './identity'

// Darwin open(2) flags. Bun 1.3.14 accepts these through node:fs.openSync but
// does not expose the O_SHLOCK/O_EXLOCK names on node:fs.constants.
const O_SHLOCK = 0x10
const O_EXLOCK = 0x20

export type FileLeaseMode = 'shared' | 'exclusive'
export type FileLeasePurpose = 'lifecycle' | 'database'

export interface FileLeaseRequest {
  readonly canonicalTarget: string
  readonly purpose: FileLeasePurpose
  readonly mode: FileLeaseMode
}

export interface FileLease {
  readonly mode: FileLeaseMode
  readonly targetDigest: string
  release(): void
}

export interface FileLeaseBackend {
  acquire(input: FileLeaseRequest): FileLease
}

export interface FileLeaseBackendOptions {
  readonly platform?: ReturnType<typeof platform>
  readonly openFile?: typeof openSync
  readonly currentUid?: number
}

interface ActiveLeaseRecord {
  readonly request: FileLeaseRequest
  active: boolean
}

const activeLeases = new WeakMap<FileLease, ActiveLeaseRecord>()

export class FileLeaseConflictError extends Error {
  readonly targetDigest: string

  constructor(targetDigest: string) {
    super('The retained file lease is already held by an incompatible owner')
    this.name = 'FileLeaseConflictError'
    this.targetDigest = targetDigest
  }
}

export class FileLeaseUnsupportedError extends Error {
  readonly reason: 'platform' | 'filesystem'

  constructor(
    reason: 'platform' | 'filesystem' = 'filesystem',
    message = 'Retained file leases are unsupported on this platform or filesystem',
  ) {
    super(message)
    this.name = 'FileLeaseUnsupportedError'
    this.reason = reason
  }
}

export class UnsafeFileLeaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeFileLeaseError'
  }
}

function digestTarget(input: FileLeaseRequest): string {
  return createHash('sha256')
    .update(
      `ctxindex-file-lease-v1|${input.purpose}|${input.canonicalTarget}`,
      'utf8',
    )
    .digest('hex')
}

export function leasePath(input: FileLeaseRequest): string {
  return input.purpose === 'database'
    ? `${input.canonicalTarget}.owner.lock`
    : join(input.canonicalTarget, 'daemon', 'lifecycle.owner.lock')
}

function validateLeaseStat(stat: Stats, currentUid: number): void {
  if (stat.isSymbolicLink())
    throw new UnsafeFileLeaseError('Lease file must not be a symlink')
  if (!stat.isFile())
    throw new UnsafeFileLeaseError('Lease file must be a regular file')
  if (stat.nlink !== 1)
    throw new UnsafeFileLeaseError('Lease file must not be a hardlink')
  if (stat.uid !== currentUid) {
    throw new UnsafeFileLeaseError(
      'Lease file must be owned by the current user',
    )
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new UnsafeFileLeaseError('Lease file must use private mode 0600')
  }
}

function existingStat(path: string, currentUid: number): Stats | null {
  try {
    const stat = lstatSync(path)
    validateLeaseStat(stat, currentUid)
    return stat
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
}

function validateLeaseParent(path: string, currentUid: number): void {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new UnsafeFileLeaseError(
      'Lease parent directory must be a regular directory',
    )
  }
  if (stat.uid !== currentUid || (stat.mode & 0o022) !== 0) {
    throw new UnsafeFileLeaseError(
      'Lease parent directory must be current-user-owned and not group/other-writable',
    )
  }
}

function validateDatabaseTarget(input: FileLeaseRequest): void {
  if (input.purpose !== 'database') return
  try {
    const stat = lstatSync(input.canonicalTarget)
    if (!stat.isFile()) {
      throw new UnsafeFileLeaseError(
        'Existing SQLite target must be a regular file',
      )
    }
    if (stat.nlink !== 1) {
      throw new UnsafeFileLeaseError(
        'Existing SQLite target must not be a hardlink',
      )
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return
    throw error
  }
}

function snapshotLeaseRequest(input: FileLeaseRequest): FileLeaseRequest {
  if (
    (input.purpose !== 'lifecycle' && input.purpose !== 'database') ||
    (input.mode !== 'shared' && input.mode !== 'exclusive')
  ) {
    throw new UnsafeFileLeaseError('Lease request is invalid')
  }
  const canonicalTarget = canonicalizePath(input.canonicalTarget)
  if (canonicalTarget !== input.canonicalTarget) {
    throw new UnsafeFileLeaseError(
      'Lease target must be canonical and absolute',
    )
  }
  return Object.freeze({
    canonicalTarget,
    purpose: input.purpose,
    mode: input.mode,
  })
}

function isConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK')
  )
}

function isUnsupported(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOTSUP' ||
      error.code === 'EOPNOTSUPP' ||
      error.code === 'EINVAL')
  )
}

class DarwinFileLeaseBackend implements FileLeaseBackend {
  readonly #openFile: typeof openSync
  readonly #currentUid: number

  constructor(openFile: typeof openSync, currentUid: number) {
    this.#openFile = openFile
    this.#currentUid = currentUid
  }

  acquire(input: FileLeaseRequest): FileLease {
    const request = snapshotLeaseRequest(input)
    validateDatabaseTarget(request)
    const path = leasePath(request)
    const parent = dirname(path)
    mkdirSync(parent, { mode: 0o700, recursive: true })
    validateLeaseParent(parent, this.#currentUid)
    const before = existingStat(path, this.#currentUid)
    const lockFlag = request.mode === 'exclusive' ? O_EXLOCK : O_SHLOCK
    const commonFlags =
      constants.O_RDWR | constants.O_NONBLOCK | constants.O_NOFOLLOW | lockFlag
    const targetDigest = digestTarget(request)
    let fd: number

    try {
      if (before === null) {
        try {
          fd = this.#openFile(
            path,
            commonFlags | constants.O_CREAT | constants.O_EXCL,
            0o600,
          )
          fchmodSync(fd, 0o600)
        } catch (error) {
          if (
            !(
              error instanceof Error &&
              'code' in error &&
              error.code === 'EEXIST'
            )
          )
            throw error
          fd = this.#openFile(path, commonFlags)
        }
      } else {
        fd = this.#openFile(path, commonFlags)
      }
    } catch (error) {
      if (isConflict(error)) {
        throw new FileLeaseConflictError(targetDigest)
      }
      if (isUnsupported(error))
        throw new FileLeaseUnsupportedError('filesystem')
      throw error
    }

    try {
      const after = fstatSync(fd)
      validateLeaseStat(after, this.#currentUid)
      if (
        before !== null &&
        (before.dev !== after.dev || before.ino !== after.ino)
      ) {
        throw new UnsafeFileLeaseError('Lease file changed during acquisition')
      }
      const pathname = lstatSync(path)
      validateLeaseStat(pathname, this.#currentUid)
      if (pathname.dev !== after.dev || pathname.ino !== after.ino) {
        throw new UnsafeFileLeaseError('Lease file changed during acquisition')
      }
      validateDatabaseTarget(request)
    } catch (error) {
      closeSync(fd)
      throw error
    }

    const record: ActiveLeaseRecord = { request, active: true }
    const lease: FileLease = {
      mode: request.mode,
      targetDigest,
      release(): void {
        if (!record.active) return
        record.active = false
        closeSync(fd)
      },
    }
    activeLeases.set(lease, record)
    return lease
  }
}

export function assertRetainedDatabaseLeaseTarget(lease: FileLease): void {
  const record = activeLeases.get(lease)
  if (
    record === undefined ||
    !record.active ||
    record.request.purpose !== 'database'
  ) {
    throw new UnsafeFileLeaseError(
      'Database access requires the matching retained database lease',
    )
  }
  validateDatabaseTarget(record.request)
}

export function assertRetainedFileLease(
  lease: FileLease,
  expected: FileLeaseRequest,
): void {
  const record = activeLeases.get(lease)
  if (
    record === undefined ||
    !record.active ||
    record.request.canonicalTarget !== expected.canonicalTarget ||
    record.request.purpose !== expected.purpose ||
    record.request.mode !== expected.mode
  ) {
    throw new UnsafeFileLeaseError(
      'Cleanup requires the matching retained lifecycle lease',
    )
  }
}

export function createFileLeaseBackend(
  options: FileLeaseBackendOptions = {},
): FileLeaseBackend {
  if ((options.platform ?? platform()) !== 'darwin')
    throw new FileLeaseUnsupportedError('platform')
  return new DarwinFileLeaseBackend(
    options.openFile ?? openSync,
    options.currentUid ?? userInfo().uid,
  )
}

export function acquireFileLease(input: FileLeaseRequest): FileLease {
  return createFileLeaseBackend().acquire(input)
}
