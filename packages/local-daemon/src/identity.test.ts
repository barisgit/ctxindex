import { afterEach, describe, expect, test } from 'bun:test'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canonicalizePath,
  type RuntimePathInput,
  resolveRuntimeIdentity,
} from './identity'

const cleanup: string[] = []

afterEach(() => {
  for (const path of cleanup.splice(0))
    rmSync(path, { force: true, recursive: true })
})

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'ctxindex-local-daemon-'))
  cleanup.push(path)
  return path
}

function paths(root: string): RuntimePathInput {
  return {
    configRoot: join(root, 'config'),
    dataRoot: join(root, 'data'),
    stateRoot: join(root, 'state'),
    cacheRoot: join(root, 'cache'),
  }
}

describe('canonical runtime identity', () => {
  test('resolves symlink aliases and missing suffixes through the longest existing ancestor', () => {
    const root = temporaryDirectory()
    const physical = join(root, 'physical')
    const alias = join(root, 'alias')
    mkdirSync(physical)
    symlinkSync(physical, alias)

    expect(canonicalizePath(join(alias, 'missing', '..', 'runtime'))).toBe(
      join(realpathSync(physical), 'runtime'),
    )
  })

  test('rejects a dangling symlink in the path ancestry', () => {
    const root = temporaryDirectory()
    const dangling = join(root, 'dangling')
    symlinkSync(join(root, 'absent'), dangling)

    expect(() => canonicalizePath(join(dangling, 'runtime'))).toThrow(
      /dangling symlink/i,
    )
  })

  test('rejects a missing suffix beneath a regular-file ancestor', () => {
    const root = temporaryDirectory()
    const file = join(root, 'not-a-directory')
    closeSync(openSync(file, 'w'))

    expect(() => canonicalizePath(join(file, 'missing'))).toThrow(
      /non-directory ancestor/i,
    )
  })

  test('canonicalizes the full tuple and SQLite path so aliases converge', () => {
    const root = temporaryDirectory()
    const physical = join(root, 'physical')
    const alias = join(root, 'alias')
    mkdirSync(physical)
    symlinkSync(physical, alias)

    const first = resolveRuntimeIdentity(paths(physical))
    const second = resolveRuntimeIdentity(paths(alias))

    expect(second).toEqual(first)
    expect(first.databasePath).toBe(
      join(realpathSync(physical), 'data', 'ctxindex.sqlite'),
    )
  })

  test('uses deterministic SHA-256 member, tuple, and database digests without raw paths', () => {
    const root = temporaryDirectory()
    const resolved = resolveRuntimeIdentity(paths(root))
    const serialized = JSON.stringify(resolved.identity)

    expect(
      Object.values(resolved.identity).every((value) =>
        /^[a-f0-9]{64}$/.test(value),
      ),
    ).toBe(true)
    expect(serialized).not.toContain(root)
    expect(resolveRuntimeIdentity(paths(root)).identity).toEqual(
      resolved.identity,
    )

    const differentData = resolveRuntimeIdentity({
      ...paths(root),
      dataRoot: join(root, 'other-data'),
    })
    expect(differentData.identity.stateDigest).toBe(
      resolved.identity.stateDigest,
    )
    expect(differentData.identity.tupleDigest).not.toBe(
      resolved.identity.tupleDigest,
    )
    expect(differentData.identity.databaseDigest).not.toBe(
      resolved.identity.databaseDigest,
    )
  })
})
