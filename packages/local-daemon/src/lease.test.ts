import { afterEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { join } from 'node:path'
import { resolveRuntimeIdentity } from './identity'
import {
  acquireFileLease,
  assertRetainedDatabaseLeaseTarget,
  createFileLeaseBackend,
  FileLeaseConflictError,
  type FileLeaseMode,
  FileLeaseUnsupportedError,
  leasePath,
} from './lease'

const cleanup: string[] = []
const children: Bun.Subprocess[] = []

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill('SIGKILL')
    await child.exited
  }
  for (const path of cleanup.splice(0))
    rmSync(path, { force: true, recursive: true })
})

function temporaryDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'ctxindex-local-daemon-'))
  const canonical = realpathSync(path)
  cleanup.push(canonical)
  return canonical
}

async function holder(
  target: string,
  mode: FileLeaseMode,
): Promise<Bun.Subprocess> {
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, 'testing', 'lease-holder.ts'),
      target,
      'database',
      mode,
    ],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
  )
  children.push(child)
  const reader = child.stdout.getReader()
  const result = await reader.read()
  reader.releaseLock()
  const line = result.value ? new TextDecoder().decode(result.value).trim() : ''
  if (!line.startsWith('ready:')) {
    const stderr = await new Response(child.stderr).text()
    throw new Error(`lease holder failed: ${stderr}`)
  }
  return child
}

function stopHolder(child: Bun.Subprocess): void {
  if (typeof child.stdin !== 'object' || child.stdin === null) {
    throw new Error('lease holder stdin is unavailable')
  }
  child.stdin.end()
}

describe.skipIf(process.platform !== 'darwin')(
  'Darwin retained file leases',
  () => {
    test('uses the Bun node:fs Darwin lock flags and keeps a permanent private regular file', () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const lease = acquireFileLease({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      const stat = lstatSync(path)

      expect(stat.isFile()).toBe(true)
      expect(stat.uid).toBe(userInfo().uid)
      expect(stat.mode & 0o777).toBe(0o600)
      expect(stat.nlink).toBe(1)
      lease.release()
      expect(existsSync(path)).toBe(true)
    })

    test('multiple separate shared owners block exclusive and exclusive blocks shared', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const first = await holder(target, 'shared')
      const second = await holder(target, 'shared')

      let sharedConflict: unknown
      try {
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        })
      } catch (error) {
        sharedConflict = error
      }
      expect(sharedConflict).toBeInstanceOf(FileLeaseConflictError)
      stopHolder(first)
      await first.exited
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(second)
      await second.exited

      const exclusive = await holder(target, 'exclusive')
      let exclusiveConflict: unknown
      try {
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'shared',
        })
      } catch (error) {
        exclusiveConflict = error
      }
      expect(exclusiveConflict).toBeInstanceOf(FileLeaseConflictError)
      stopHolder(exclusive)
      await exclusive.exited
    })

    test('does not attribute a stale lease-file record to a shared holder', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'shared',
      })
      const staleOwner = 'a'.repeat(64)
      writeFileSync(path, `${staleOwner}\n`, { mode: 0o600 })
      const shared = await holder(target, 'shared')
      expect(readFileSync(path, 'utf8')).toBe(`${staleOwner}\n`)

      let conflict: unknown
      try {
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        })
      } catch (error) {
        conflict = error
      }

      expect(conflict).toBeInstanceOf(FileLeaseConflictError)
      expect(conflict).not.toHaveProperty('ownerTupleDigest')
      expect(JSON.stringify(conflict)).not.toContain(staleOwner)
      stopHolder(shared)
      await shared.exited
    })

    test('SIGKILL immediately releases kernel ownership without unlinking', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const child = await holder(target, 'exclusive')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      child.kill('SIGKILL')
      await child.exited

      const reacquired = acquireFileLease({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      expect(existsSync(path)).toBe(true)
      reacquired.release()
    })

    test('separate processes converge through path aliases and database identity', async () => {
      const root = temporaryDirectory()
      const physical = join(root, 'physical')
      const alias = join(root, 'alias')
      mkdirSync(physical)
      symlinkSync(physical, alias)

      const firstIdentity = resolveRuntimeIdentity({
        configRoot: join(physical, 'config'),
        dataRoot: join(physical, 'data'),
        stateRoot: join(physical, 'state-one'),
        cacheRoot: join(physical, 'cache'),
      })
      const aliasIdentity = resolveRuntimeIdentity({
        configRoot: join(alias, 'config'),
        dataRoot: join(alias, 'data'),
        stateRoot: join(alias, 'state-two'),
        cacheRoot: join(alias, 'cache'),
      })
      const holderProcess = await holder(
        firstIdentity.databasePath,
        'exclusive',
      )

      expect(aliasIdentity.databasePath).toBe(firstIdentity.databasePath)
      expect(aliasIdentity.identity.databaseDigest).toBe(
        firstIdentity.identity.databaseDigest,
      )
      expect(() =>
        acquireFileLease({
          canonicalTarget: aliasIdentity.databasePath,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(holderProcess)
      await holderProcess.exited
    })

    test('rejects an absolute alias instead of permitting a second lease key', () => {
      const root = temporaryDirectory()
      const physical = join(root, 'physical')
      const alias = join(root, 'alias')
      mkdirSync(physical)
      symlinkSync(physical, alias)

      expect(() =>
        acquireFileLease({
          canonicalTarget: join(alias, 'ctxindex.sqlite'),
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/canonical/i)
    })

    test('rejects hard-linked existing SQLite aliases before either can acquire', () => {
      const root = temporaryDirectory()
      const firstData = join(root, 'first')
      const secondData = join(root, 'second')
      mkdirSync(firstData)
      mkdirSync(secondData)
      const firstDatabase = join(firstData, 'ctxindex.sqlite')
      const secondDatabase = join(secondData, 'ctxindex.sqlite')
      writeFileSync(firstDatabase, 'sqlite')
      linkSync(firstDatabase, secondDatabase)

      for (const canonicalTarget of [firstDatabase, secondDatabase]) {
        expect(() =>
          acquireFileLease({
            canonicalTarget,
            purpose: 'database',
            mode: 'exclusive',
          }),
        ).toThrow(/hardlink/i)
      }
    })

    test('rejects both database aliases when a hardlink appears during lease open', () => {
      const root = temporaryDirectory()
      const firstData = join(root, 'first')
      const secondData = join(root, 'second')
      mkdirSync(firstData)
      mkdirSync(secondData)
      const firstDatabase = join(firstData, 'ctxindex.sqlite')
      const secondDatabase = join(secondData, 'ctxindex.sqlite')
      let linked = false
      const linkingOpen: typeof openSync = (openPath, flags, mode) => {
        const fd = openSync(openPath, flags, mode)
        if (!linked) {
          linked = true
          writeFileSync(firstDatabase, 'sqlite')
          linkSync(firstDatabase, secondDatabase)
        }
        return fd
      }
      const backend = createFileLeaseBackend({ openFile: linkingOpen })

      expect(() =>
        backend.acquire({
          canonicalTarget: firstDatabase,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/hardlink/i)
      expect(() =>
        acquireFileLease({
          canonicalTarget: secondDatabase,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/hardlink/i)
    })

    test('retained database assertion rejects a hardlink created after acquisition', () => {
      const root = temporaryDirectory()
      const database = join(root, 'ctxindex.sqlite')
      writeFileSync(database, 'sqlite')
      const lease = acquireFileLease({
        canonicalTarget: database,
        purpose: 'database',
        mode: 'exclusive',
      })
      linkSync(database, join(root, 'database-alias.sqlite'))

      expect(() => assertRetainedDatabaseLeaseTarget(lease)).toThrow(
        /hardlink/i,
      )
      lease.release()
      expect(() => assertRetainedDatabaseLeaseTarget(lease)).toThrow(
        /retained database lease/i,
      )
    })

    test('snapshots the validated request so caller mutation cannot redirect assertions', () => {
      const root = temporaryDirectory()
      const originalDatabase = join(root, 'ctxindex.sqlite')
      const redirectedDatabase = join(root, 'redirected.sqlite')
      writeFileSync(originalDatabase, 'sqlite')
      const request: {
        canonicalTarget: string
        purpose: 'database' | 'lifecycle'
        mode: FileLeaseMode
      } = {
        canonicalTarget: originalDatabase,
        purpose: 'database',
        mode: 'exclusive',
      }
      const lease = acquireFileLease(request)
      request.canonicalTarget = redirectedDatabase
      request.purpose = 'lifecycle'
      linkSync(originalDatabase, join(root, 'database-alias.sqlite'))

      expect(() => assertRetainedDatabaseLeaseTarget(lease)).toThrow(
        /hardlink/i,
      )
      lease.release()
    })

    test('same canonical state lifecycle target excludes a different tuple', async () => {
      const root = temporaryDirectory()
      const stateRoot = join(root, 'state')
      const child = Bun.spawn(
        [
          process.execPath,
          join(import.meta.dir, 'testing', 'lease-holder.ts'),
          stateRoot,
          'lifecycle',
          'exclusive',
        ],
        { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
      )
      children.push(child)
      const reader = child.stdout.getReader()
      await reader.read()
      reader.releaseLock()

      expect(() =>
        acquireFileLease({
          canonicalTarget: stateRoot,
          purpose: 'lifecycle',
          mode: 'exclusive',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(child)
      await child.exited
    })

    test('symlink, hardlink, non-regular, and non-private targets fail closed', () => {
      const root = temporaryDirectory()
      const target = join(root, 'ctxindex.sqlite')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })

      symlinkSync(join(root, 'elsewhere'), path)
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/symlink/i)
      rmSync(path)

      const fd = openSync(path, 'w', 0o600)
      closeSync(fd)
      linkSync(path, join(root, 'second-link'))
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/hardlink/i)
      rmSync(join(root, 'second-link'))

      chmodSync(path, 0o644)
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/private/i)
      rmSync(path)

      mkdirSync(path)
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/regular file/i)
    })

    test('rejects a lock file not owned by the expected current uid', () => {
      const root = temporaryDirectory()
      const target = join(root, 'ctxindex.sqlite')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      closeSync(openSync(path, 'w', 0o600))
      const backend = createFileLeaseBackend({
        currentUid: userInfo().uid + 1,
      })

      expect(() =>
        backend.acquire({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/current-user/i)
    })

    test('rejects a group-writable lease parent directory', () => {
      const root = temporaryDirectory()
      const dataRoot = join(root, 'unsafe-data')
      mkdirSync(dataRoot, { mode: 0o770 })
      chmodSync(dataRoot, 0o770)

      expect(() =>
        acquireFileLease({
          canonicalTarget: join(dataRoot, 'ctxindex.sqlite'),
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/parent directory/i)
    })

    test('rejects pathname replacement after opening a newly-created lease file', () => {
      const root = temporaryDirectory()
      const target = join(root, 'ctxindex.sqlite')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      let replaced = false
      const replacingOpen: typeof openSync = (openPath, flags, mode) => {
        const fd = openSync(openPath, flags, mode)
        if (!replaced) {
          replaced = true
          renameSync(path, `${path}.opened`)
          closeSync(openSync(path, 'w', 0o600))
        }
        return fd
      }
      const backend = createFileLeaseBackend({ openFile: replacingOpen })

      expect(() =>
        backend.acquire({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(/changed during acquisition/i)
    })
  },
)

describe('Linux retained file lease backend', () => {
  test.each([
    ['exclusive', '-x'],
    ['shared', '-s'],
  ] as const)('invokes a trusted absolute flock once for a retained %s lease', (mode, modeFlag) => {
    const target = join(temporaryDirectory(), 'ctxindex.sqlite')
    const calls: Array<{
      executable: string
      args: readonly string[]
      fd: number
    }> = []
    const backend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => '/usr/bin/flock',
      spawnFlock: (executable, args, fd) => {
        expect(fstatSync(fd).isFile()).toBe(true)
        calls.push({ executable, args, fd })
        return { status: 0 }
      },
    })

    const lease = backend.acquire({
      canonicalTarget: target,
      purpose: 'database',
      mode,
    })
    const path = leasePath({
      canonicalTarget: target,
      purpose: 'database',
      mode,
    })
    const stat = lstatSync(path)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      executable: '/usr/bin/flock',
      args: ['-n', '-E', '73', modeFlag, '3'],
    })
    expect(stat.isFile()).toBe(true)
    expect(stat.uid).toBe(userInfo().uid)
    expect(stat.mode & 0o777).toBe(0o600)
    expect(stat.nlink).toBe(1)
    const retainedFd = calls[0]?.fd
    expect(retainedFd).toBeNumber()
    expect(fstatSync(retainedFd as number).isFile()).toBe(true)

    lease.release()
    expect(() => fstatSync(retainedFd as number)).toThrow()
    expect(existsSync(path)).toBe(true)
    lease.release()
  })

  test('maps exit 73 to a holder-neutral conflict and closes the parent fd', () => {
    const target = join(temporaryDirectory(), 'ctxindex.sqlite')
    let inheritedFd: number | undefined
    const backend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => '/usr/bin/flock',
      spawnFlock: (_executable, _args, fd) => {
        inheritedFd = fd
        return { status: 73 }
      },
    })

    let conflict: unknown
    try {
      backend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
    } catch (error) {
      conflict = error
    }

    expect(conflict).toBeInstanceOf(FileLeaseConflictError)
    expect(conflict).not.toHaveProperty('ownerTupleDigest')
    expect(() => fstatSync(inheritedFd as number)).toThrow()
  })

  test('closes a newly opened fd when private-mode enforcement fails', () => {
    let openedFd: number | undefined
    const capturingOpen: typeof openSync = (path, flags, mode) => {
      openedFd = openSync(path, flags, mode)
      return openedFd
    }
    const backend = createFileLeaseBackend({
      platform: 'linux',
      openFile: capturingOpen,
      resolveFlock: () => '/usr/bin/flock',
      setFileMode: () => {
        throw new Error('mode enforcement failed')
      },
      spawnFlock: () => ({ status: 0 }),
    })

    expect(() =>
      backend.acquire({
        canonicalTarget: join(temporaryDirectory(), 'ctxindex.sqlite'),
        purpose: 'database',
        mode: 'exclusive',
      }),
    ).toThrow()
    expect(() => fstatSync(openedFd as number)).toThrow()
  })

  test.each([
    1,
    null,
  ] as const)('maps a non-conflict flock result %p to a redacted unsupported error', (status) => {
    const backend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => '/usr/bin/flock',
      spawnFlock: () => ({ status }),
    })

    let failure: unknown
    try {
      backend.acquire({
        canonicalTarget: join(temporaryDirectory(), 'ctxindex.sqlite'),
        purpose: 'database',
        mode: 'exclusive',
      })
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(failure).toMatchObject({ reason: 'filesystem' })
    expect(String(failure)).not.toContain('stderr')
  })

  test('redacts spawn failures and rejects a non-absolute resolver result', () => {
    const target = join(temporaryDirectory(), 'ctxindex.sqlite')
    const throwingBackend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => '/usr/bin/flock',
      spawnFlock: () => {
        throw new Error('secret child detail')
      },
    })

    expect(() =>
      throwingBackend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      }),
    ).toThrow(FileLeaseUnsupportedError)
    try {
      throwingBackend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
    } catch (error) {
      expect(String(error)).not.toContain('secret child detail')
    }

    let spawned = false
    const relativeBackend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => 'flock',
      spawnFlock: () => {
        spawned = true
        return { status: 0 }
      },
    })
    expect(() =>
      relativeBackend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      }),
    ).toThrow(FileLeaseUnsupportedError)
    expect(spawned).toBe(false)
  })

  test('redacts resolver failures and rejects unsafe files before spawning flock', () => {
    const target = join(temporaryDirectory(), 'ctxindex.sqlite')
    const throwingBackend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => {
        throw new Error('secret resolver detail')
      },
      spawnFlock: () => ({ status: 0 }),
    })
    let failure: unknown
    try {
      throwingBackend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(String(failure)).not.toContain('secret resolver detail')

    const path = leasePath({
      canonicalTarget: target,
      purpose: 'database',
      mode: 'exclusive',
    })
    rmSync(path)
    symlinkSync(join(temporaryDirectory(), 'elsewhere'), path)
    let spawned = false
    const unsafeBackend = createFileLeaseBackend({
      platform: 'linux',
      resolveFlock: () => '/usr/bin/flock',
      spawnFlock: () => {
        spawned = true
        return { status: 0 }
      },
    })
    expect(() =>
      unsafeBackend.acquire({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      }),
    ).toThrow(/symlink/i)
    expect(spawned).toBe(false)
  })
})

describe.skipIf(process.platform !== 'linux')(
  'Linux multi-process retained file leases',
  () => {
    test('shared owners block exclusive and an exclusive owner blocks shared', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const first = await holder(target, 'shared')
      const second = await holder(target, 'shared')

      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(first)
      await first.exited
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'exclusive',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(second)
      await second.exited

      const exclusive = await holder(target, 'exclusive')
      expect(() =>
        acquireFileLease({
          canonicalTarget: target,
          purpose: 'database',
          mode: 'shared',
        }),
      ).toThrow(FileLeaseConflictError)
      stopHolder(exclusive)
      await exclusive.exited
    })

    test('SIGKILL releases ownership immediately and preserves the lease file', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const child = await holder(target, 'exclusive')
      const path = leasePath({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      child.kill('SIGKILL')
      await child.exited

      const reacquired = acquireFileLease({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      expect(existsSync(path)).toBe(true)
      reacquired.release()
    })

    test('release unlocks immediately while the holder process remains alive', async () => {
      const target = join(temporaryDirectory(), 'ctxindex.sqlite')
      const child = await holder(target, 'exclusive')
      if (typeof child.stdin !== 'object' || child.stdin === null) {
        throw new Error('lease holder stdin is unavailable')
      }
      child.stdin.write('release\n')
      await child.stdin.flush()
      if (!(child.stdout instanceof ReadableStream)) {
        throw new Error('lease holder stdout is unavailable')
      }
      const reader = child.stdout.getReader()
      const result = await reader.read()
      reader.releaseLock()
      expect(
        result.value ? new TextDecoder().decode(result.value).trim() : '',
      ).toBe('released')
      expect(child.exitCode).toBeNull()

      const reacquired = acquireFileLease({
        canonicalTarget: target,
        purpose: 'database',
        mode: 'exclusive',
      })
      reacquired.release()
      expect(child.exitCode).toBeNull()
      stopHolder(child)
      await child.exited
    })
  },
)

test('unsupported platforms fail closed without exposing a boolean probe', () => {
  try {
    createFileLeaseBackend({ platform: 'win32' })
    throw new Error('expected unsupported platform')
  } catch (error) {
    expect(error).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(error).toMatchObject({ reason: 'platform' })
  }
})

test('unsupported filesystems fail closed with a safe typed error', () => {
  const unsupportedOpen: typeof openSync = () => {
    const error = new Error('filesystem detail') as NodeJS.ErrnoException
    error.code = 'EOPNOTSUPP'
    throw error
  }
  const backend = createFileLeaseBackend({
    platform: 'darwin',
    openFile: unsupportedOpen,
  })

  try {
    backend.acquire({
      canonicalTarget: join(temporaryDirectory(), 'ctxindex.sqlite'),
      purpose: 'database',
      mode: 'exclusive',
    })
    throw new Error('expected unsupported filesystem')
  } catch (error) {
    expect(error).toBeInstanceOf(FileLeaseUnsupportedError)
    expect(error).toMatchObject({ reason: 'filesystem' })
  }
})
