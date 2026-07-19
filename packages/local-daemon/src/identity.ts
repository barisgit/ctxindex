import { createHash } from 'node:crypto'
import { lstatSync, realpathSync } from 'node:fs'
import { basename, join, parse, resolve } from 'node:path'

export interface RuntimePathInput {
  readonly configRoot: string
  readonly dataRoot: string
  readonly stateRoot: string
  readonly cacheRoot: string
}

export interface RuntimeIdentity {
  readonly tupleDigest: string
  readonly configDigest: string
  readonly dataDigest: string
  readonly stateDigest: string
  readonly cacheDigest: string
  readonly databaseDigest: string
}

export interface CanonicalRuntimeIdentity extends RuntimePathInput {
  readonly databasePath: string
  readonly identity: RuntimeIdentity
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}

function appendPath(base: string, suffix: readonly string[]): string {
  return suffix.length === 0 ? base : join(base, ...suffix)
}

export function canonicalizePath(input: string): string {
  if (input.length === 0) throw new Error('Path must not be empty')
  const absolute = resolve(input)

  const suffix: string[] = []
  let candidate = absolute
  const root = parse(absolute).root

  while (true) {
    try {
      const canonicalAncestor = realpathSync.native(candidate)
      if (suffix.length > 0 && !lstatSync(canonicalAncestor).isDirectory()) {
        throw new Error(
          `Path has a non-directory ancestor: ${canonicalAncestor}`,
        )
      }
      return appendPath(canonicalAncestor, suffix)
    } catch (error) {
      if (!isMissingPathError(error)) throw error

      try {
        if (lstatSync(candidate).isSymbolicLink()) {
          throw new Error(`Path contains a dangling symlink: ${candidate}`)
        }
      } catch (lstatError) {
        if (!isMissingPathError(lstatError)) throw lstatError
      }

      if (candidate === root) throw error
      const parent = resolve(candidate, '..')
      suffix.unshift(basename(candidate))
      candidate = parent
    }
  }
}

function digestTuple(paths: RuntimePathInput): string {
  const members = [
    paths.configRoot,
    paths.dataRoot,
    paths.stateRoot,
    paths.cacheRoot,
  ]
  const encoded = members
    .map((value) => `${Buffer.byteLength(value, 'utf8')}:${value}`)
    .join('|')
  return sha256(`ctxindex-runtime-tuple-v1|${encoded}`)
}

export function resolveRuntimeIdentity(
  input: RuntimePathInput,
): CanonicalRuntimeIdentity {
  const canonicalPaths: RuntimePathInput = {
    configRoot: canonicalizePath(input.configRoot),
    dataRoot: canonicalizePath(input.dataRoot),
    stateRoot: canonicalizePath(input.stateRoot),
    cacheRoot: canonicalizePath(input.cacheRoot),
  }
  const databasePath = canonicalizePath(
    join(canonicalPaths.dataRoot, 'ctxindex.sqlite'),
  )

  return {
    ...canonicalPaths,
    databasePath,
    identity: {
      tupleDigest: digestTuple(canonicalPaths),
      configDigest: sha256(
        `ctxindex-config-root-v1|${canonicalPaths.configRoot}`,
      ),
      dataDigest: sha256(`ctxindex-data-root-v1|${canonicalPaths.dataRoot}`),
      stateDigest: sha256(`ctxindex-state-root-v1|${canonicalPaths.stateRoot}`),
      cacheDigest: sha256(`ctxindex-cache-root-v1|${canonicalPaths.cacheRoot}`),
      databaseDigest: sha256(`ctxindex-database-v1|${databasePath}`),
    },
  }
}
