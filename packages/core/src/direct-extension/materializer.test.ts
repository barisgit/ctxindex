import { afterEach, expect, test } from 'bun:test'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BunPackageMaterializer, runPackageProcess } from './materializer'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

test('local materialization snapshots code and resolves ordinary dependencies without symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-local-package-'))
  roots.push(root)
  const packageRoot = join(root, 'extension')
  await mkdir(join(packageRoot, 'dependency'), { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture-extension',
      version: '1.0.0',
      type: 'module',
      ctxindex: { extensions: ['./index.ts'] },
      dependencies: { 'fixture-dependency': 'file:./dependency' },
    }),
  )
  await writeFile(
    join(packageRoot, 'index.ts'),
    "export { value } from 'fixture-dependency'\n",
  )
  await writeFile(
    join(packageRoot, 'dependency', 'package.json'),
    JSON.stringify({
      name: 'fixture-dependency',
      version: '1.0.0',
      type: 'module',
      exports: './index.js',
    }),
  )
  await writeFile(
    join(packageRoot, 'dependency', 'index.js'),
    'export const value = 42\n',
  )

  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
  })
  const result = await materializer.materialize({
    kind: 'local',
    requestedTarget: packageRoot,
    originPath: packageRoot,
  })
  try {
    expect(result.source.kind).toBe('local')
    expect(result.packageRoot).toBe('package')
    expect(result.materializationDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(
      await readFile(join(result.stagingRoot, 'package', 'index.ts'), 'utf8'),
    ).toContain('fixture-dependency')
    expect(
      await Bun.file(
        join(
          result.stagingRoot,
          'package',
          'node_modules',
          'fixture-dependency',
          'index.js',
        ),
      ).exists(),
    ).toBe(true)
  } finally {
    await result.cleanup()
  }
})

test('Catalog-local replay excludes only snapshot-owned generated metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-catalog-local-'))
  roots.push(root)
  const packageRoot = join(root, 'catalog')
  await mkdir(join(packageRoot, 'ctxindex-resolutions'), { recursive: true })
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: 'fixture-catalog',
      version: '1.0.0',
      ctxindex: { extensions: ['./index.ts'] },
    }),
  )
  await writeFile(join(packageRoot, 'index.ts'), 'export default {}\n')
  await writeFile(join(packageRoot, 'ctxindex-catalog.json'), '{"old":true}\n')
  await writeFile(
    join(packageRoot, 'ctxindex-resolutions', 'old.json'),
    '{"old":true}\n',
  )
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      const lockPath = join(input.cwd, 'bun.lock')
      if (!(await Bun.file(lockPath).exists())) {
        await writeFile(
          lockPath,
          JSON.stringify({ lockfileVersion: 1, packages: {} }),
        )
      }
    },
  })

  const resolved = await materializer.materialize(
    {
      kind: 'local',
      requestedTarget: '.',
      originPath: packageRoot,
    },
    { excludeCatalogSnapshotMetadata: true },
  )
  try {
    expect(
      await Bun.file(
        join(resolved.stagingRoot, 'package', 'ctxindex-catalog.json'),
      ).exists(),
    ).toBe(false)
    await writeFile(
      join(packageRoot, 'ctxindex-catalog.json'),
      '{"new":true}\n',
    )
    await writeFile(
      join(packageRoot, 'ctxindex-resolutions', 'new.json'),
      '{"new":true}\n',
    )
    const replayed = await materializer.materializeExact({
      source: resolved.source,
      packageRoot: resolved.packageRoot,
      materializationDigest: resolved.materializationDigest,
      dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      localPackageRoot: packageRoot,
      excludeCatalogSnapshotMetadata: true,
    })
    await replayed.cleanup()

    const direct = await materializer.materialize({
      kind: 'local',
      requestedTarget: packageRoot,
      originPath: packageRoot,
    })
    try {
      expect(direct.source).not.toMatchObject({
        content_digest:
          resolved.source.kind === 'local'
            ? resolved.source.content_digest
            : undefined,
      })
      expect(
        await Bun.file(
          join(direct.stagingRoot, 'package', 'ctxindex-catalog.json'),
        ).exists(),
      ).toBe(true)
    } finally {
      await direct.cleanup()
    }
  } finally {
    await resolved.cleanup()
  }
})

test('exact local replay normalizes copied package-root permissions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-local-permissions-'))
  roots.push(root)
  const packageRoot = join(root, 'extension')
  await mkdir(packageRoot)
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'fixture-extension', version: '1.0.0' }),
  )
  await writeFile(join(packageRoot, 'index.ts'), 'export default {}\n')
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      const lockPath = join(input.cwd, 'bun.lock')
      if (!(await Bun.file(lockPath).exists())) {
        await writeFile(
          lockPath,
          JSON.stringify({ lockfileVersion: 1, packages: {} }),
        )
      }
    },
  })
  const resolved = await materializer.materialize({
    kind: 'local',
    requestedTarget: packageRoot,
    originPath: packageRoot,
  })
  try {
    await chmod(packageRoot, 0o700)
    const replayed = await materializer.materializeExact({
      source: resolved.source,
      packageRoot: resolved.packageRoot,
      materializationDigest: resolved.materializationDigest,
      dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      localPackageRoot: packageRoot,
    })
    await replayed.cleanup()
  } finally {
    await resolved.cleanup()
  }
})

test('local materialization freezes an exact empty lock when Bun omits one', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-local-empty-lock-'))
  roots.push(root)
  const packageRoot = join(root, 'extension')
  await mkdir(packageRoot)
  await writeFile(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'fixture-extension', version: '1.0.0' }),
  )
  let calls = 0
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async () => {
      calls++
    },
  })
  const resolved = await materializer.materialize({
    kind: 'local',
    requestedTarget: packageRoot,
    originPath: packageRoot,
  })
  try {
    expect(calls).toBe(1)
    const replayed = await materializer.materializeExact({
      source: resolved.source,
      packageRoot: resolved.packageRoot,
      materializationDigest: resolved.materializationDigest,
      dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      localPackageRoot: packageRoot,
    })
    await replayed.cleanup()
    expect(calls).toBe(1)
  } finally {
    await resolved.cleanup()
  }
})

test('runner receives executable and argv without shell interpolation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-npm-materializer-'))
  roots.push(root)
  const calls: Array<{
    executable: string
    args: readonly string[]
    cwd: string
  }> = []
  const materializer = new BunPackageMaterializer({
    stagingParent: root,
    run: async (input) => {
      calls.push({
        executable: input.executable,
        args: input.args,
        cwd: input.cwd,
      })
      await mkdir(join(input.cwd, 'node_modules', '@example', 'mail'), {
        recursive: true,
      })
      await writeFile(
        join(input.cwd, 'package.json'),
        JSON.stringify({ dependencies: { '@example/mail': '^2' } }),
      )
      await writeFile(
        join(input.cwd, 'node_modules', '@example', 'mail', 'package.json'),
        JSON.stringify({ name: '@example/mail', version: '2.3.4' }),
      )
      await writeFile(
        join(input.cwd, 'bun.lock'),
        `{
          "lockfileVersion": 1,
          "packages": {
            "@example/mail": ["@example/mail@2.3.4", "", {}, "sha512-safe"],
          },
        }`,
      )
    },
  })
  const result = await materializer.materialize({
    kind: 'npm',
    requestedTarget: '@example/mail@^2; touch /tmp/never',
  })
  try {
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ executable: 'bun' })
    expect(calls[0]?.args).toContain('@example/mail@^2; touch /tmp/never')
    expect(result.source).toEqual({
      kind: 'npm',
      requested_target: '@example/mail@^2; touch /tmp/never',
      package: '@example/mail',
      exact_version: '2.3.4',
      integrity: 'sha512-safe',
    })
  } finally {
    await result.cleanup()
  }
})

async function materializeGit(
  lockText: string,
  requestedTarget = 'git+https://example.com/repository.git#main',
) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-git-materializer-'))
  roots.push(root)
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      await mkdir(join(input.cwd, 'node_modules', 'fixture-git-extension'), {
        recursive: true,
      })
      if (input.args[0] === 'add') {
        await writeFile(
          join(input.cwd, 'package.json'),
          JSON.stringify({
            dependencies: {
              'fixture-git-extension': requestedTarget,
            },
          }),
        )
      }
      await writeFile(
        join(
          input.cwd,
          'node_modules',
          'fixture-git-extension',
          'package.json',
        ),
        JSON.stringify({ name: 'fixture-git-extension', version: '1.0.0' }),
      )
      const packageMode = input.args[0] === 'add' ? 0o755 : 0o777
      const fileMode = input.args[0] === 'add' ? 0o644 : 0o666
      await chmod(
        join(input.cwd, 'node_modules', 'fixture-git-extension'),
        packageMode,
      )
      await chmod(
        join(
          input.cwd,
          'node_modules',
          'fixture-git-extension',
          'package.json',
        ),
        fileMode,
      )
      if (!(await Bun.file(join(input.cwd, 'bun.lock')).exists())) {
        await writeFile(join(input.cwd, 'bun.lock'), lockText)
      }
    },
  })
  return {
    materializer,
    result: await materializer.materialize({
      kind: 'git',
      requestedTarget,
    }),
  }
}

test.each([
  [
    'URL',
    'git+ssh://git@example.com/repository.git#main',
    'git+ssh://git@example.com/repository.git',
  ],
  [
    'scp-like',
    'git@example.com:repository.git#main',
    'git+ssh://git@example.com/repository.git',
  ],
])('Git SSH materialization and frozen exact replay allow the credential-free git user in %s syntax', async (_label, requestedTarget, resolvedRepository) => {
  const commit = 'b'.repeat(40)
  const { materializer, result } = await materializeGit(
    JSON.stringify({
      lockfileVersion: 1,
      packages: {
        'fixture-git-extension': [
          `fixture-git-extension@${resolvedRepository}`,
          {},
          commit,
        ],
      },
    }),
    requestedTarget,
  )
  try {
    expect(result.source).toMatchObject({
      kind: 'git',
      requested_target: requestedTarget,
      repository: resolvedRepository,
      commit,
    })
    const replayed = await materializer.materializeExact({
      source: result.source,
      packageRoot: result.packageRoot,
      materializationDigest: result.materializationDigest,
      dependencyResolutionArtifact: result.dependencyResolutionArtifact,
    })
    await replayed.cleanup()
  } finally {
    await result.cleanup()
  }
})

test('Git materialization records the selected package tuple commit', async () => {
  const unrelatedCommit = 'a'.repeat(40)
  const commit = 'b'.repeat(40)
  const { materializer, result } = await materializeGit(`{
    "lockfileVersion": 1,
    // Bun lockfiles permit line comments.
    "packages": {
      "unrelated": ["unrelated@git+https://example.com/unrelated.git", {}, "${unrelatedCommit}"],
      /* The selected package may follow a block comment. */
      "fixture-git-extension": ["fixture-git-extension@git+https://example.com/repository.git", {}, "${commit}"],
    },
  }`)
  try {
    expect(result.source).toMatchObject({
      kind: 'git',
      requested_target: 'git+https://example.com/repository.git#main',
      repository: 'git+https://example.com/repository.git',
    })
    expect(result.source.kind === 'git' && result.source.commit).toBe(commit)
    if (result.source.kind !== 'git') throw new TypeError('Expected Git source')
    const replayed = await materializer.materializeExact({
      source: result.source,
      packageRoot: result.packageRoot,
      materializationDigest: result.materializationDigest,
      dependencyResolutionArtifact: result.dependencyResolutionArtifact,
    })
    await replayed.cleanup()
    await expect(
      materializer.materializeExact({
        source: { ...result.source, commit: 'c'.repeat(40) },
        packageRoot: result.packageRoot,
        materializationDigest: result.materializationDigest,
        dependencyResolutionArtifact: result.dependencyResolutionArtifact,
      }),
    ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
    await expect(
      materializer.materializeExact({
        source: {
          ...result.source,
          repository: 'git+https://example.com/other.git',
        },
        packageRoot: result.packageRoot,
        materializationDigest: result.materializationDigest,
        dependencyResolutionArtifact: result.dependencyResolutionArtifact,
      }),
    ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
  } finally {
    await result.cleanup()
  }
})

test('Git materialization resolves an aliased dependency to its scoped installed package root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-git-alias-'))
  roots.push(root)
  const commit = 'd'.repeat(40)
  const lockText = JSON.stringify({
    lockfileVersion: 1,
    packages: {
      extension: [
        '@fixture/catalog-git-extension@git+http://example.test/repository.git',
        {},
        commit,
      ],
    },
  })
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      if (input.args[0] === 'add') {
        await writeFile(
          join(input.cwd, 'package.json'),
          JSON.stringify({
            dependencies: {
              extension: 'git+http://example.test/repository.git#main',
            },
          }),
        )
      }
      await mkdir(
        join(input.cwd, 'node_modules', '@fixture', 'catalog-git-extension'),
        { recursive: true },
      )
      await writeFile(
        join(
          input.cwd,
          'node_modules',
          '@fixture',
          'catalog-git-extension',
          'package.json',
        ),
        JSON.stringify({
          name: '@fixture/catalog-git-extension',
          version: '1.0.0',
        }),
      )
      if (!(await Bun.file(join(input.cwd, 'bun.lock')).exists())) {
        await writeFile(join(input.cwd, 'bun.lock'), lockText)
      }
    },
  })

  const resolved = await materializer.materialize({
    kind: 'git',
    requestedTarget: 'git+http://example.test/repository.git#main',
  })
  try {
    expect(resolved.packageRoot).toBe(
      'node_modules/@fixture/catalog-git-extension',
    )
    const replayed = await materializer.materializeExact({
      source: resolved.source,
      packageRoot: resolved.packageRoot,
      materializationDigest: resolved.materializationDigest,
      dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
    })
    await replayed.cleanup()
  } finally {
    await resolved.cleanup()
  }
})

test('Git materialization accepts Bun loopback git+http lock resolutions', async () => {
  const commit = 'b'.repeat(40)
  const { result } = await materializeGit(`{
    "lockfileVersion": 1,
    "workspaces": {
      "": {
        "dependencies": {
          "fixture-git-extension": "git+http://127.0.0.1/repository.git#main"
        }
      }
    },
    "packages": {
      "fixture-git-extension": ["fixture-git-extension@git+http://127.0.0.1/repository.git", {}, "${commit}"],
    },
  }`)
  try {
    expect(result.source.kind === 'git' && result.source.commit).toBe(commit)
  } finally {
    await result.cleanup()
  }
})

test('Git materialization ignores unrelated commits when the selected tuple has no exact revision', async () => {
  const unrelatedCommit = 'a'.repeat(40)
  await expect(
    materializeGit(`{
      "lockfileVersion": 1,
      "packages": {
        "unrelated": ["unrelated@git+https://example.com/unrelated.git", {}, "${unrelatedCommit}"],
        "fixture-git-extension": ["fixture-git-extension@git+https://example.com/repository.git", {}, "main"],
      },
    }`).then(({ result }) => result),
  ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
})

test('materialization emits a sanitized exact Bun resolution artifact and frozen replay reproduces it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-exact-materializer-'))
  roots.push(root)
  const calls: string[][] = []
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      calls.push([...input.args])
      if (input.args[0] === 'add') {
        await writeFile(
          join(input.cwd, 'package.json'),
          JSON.stringify({
            name: 'ctxindex-direct-staging',
            private: true,
            dependencies: { 'fixture-exact': 'fixture-exact@^2' },
          }),
        )
      }
      const manifest = JSON.parse(
        await readFile(join(input.cwd, 'package.json'), 'utf8'),
      ) as { dependencies: Record<string, string> }
      const packageName = Object.keys(manifest.dependencies)[0] as string
      await mkdir(join(input.cwd, 'node_modules', packageName), {
        recursive: true,
      })
      await writeFile(
        join(input.cwd, 'node_modules', packageName, 'package.json'),
        JSON.stringify({ name: packageName, version: '2.3.4' }),
      )
      if (!(await Bun.file(join(input.cwd, 'bun.lock')).exists())) {
        await writeFile(
          join(input.cwd, 'bun.lock'),
          JSON.stringify({
            lockfileVersion: 1,
            packages: {
              [packageName]: [`${packageName}@2.3.4`, '', {}, 'sha512-safe'],
            },
          }),
        )
      }
    },
  })

  const resolved = await materializer.materialize({
    kind: 'npm',
    requestedTarget: 'fixture-exact@^2',
  })
  try {
    expect(resolved.dependencyResolutionArtifact.format).toBe('bun.lock@1.3.14')
    expect(resolved.dependencyResolutionArtifact.digest).toMatch(
      /^[0-9a-f]{64}$/,
    )
    const artifactText = new TextDecoder().decode(
      resolved.dependencyResolutionArtifact.bytes,
    )
    expect(artifactText).toContain('fixture-exact')
    expect(artifactText).not.toContain('username')

    const replayed = await materializer.materializeExact({
      source: resolved.source,
      packageRoot: resolved.packageRoot,
      materializationDigest: resolved.materializationDigest,
      dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
    })
    try {
      expect(replayed.materializationDigest).toBe(
        resolved.materializationDigest,
      )
      expect(calls).toHaveLength(2)
      expect(calls[0]?.[0]).toBe('add')
      expect(calls[1]).toEqual([
        'install',
        '--save-text-lockfile',
        '--frozen-lockfile',
        '--production',
        '--ignore-scripts',
      ])
    } finally {
      await replayed.cleanup()
    }

    if (resolved.source.kind !== 'npm')
      throw new TypeError('Expected npm source')
    await expect(
      materializer.materializeExact({
        source: { ...resolved.source, exact_version: '9.9.9' },
        packageRoot: resolved.packageRoot,
        materializationDigest: resolved.materializationDigest,
        dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      }),
    ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
    await expect(
      materializer.materializeExact({
        source: { ...resolved.source, integrity: 'sha512-other' },
        packageRoot: resolved.packageRoot,
        materializationDigest: resolved.materializationDigest,
        dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      }),
    ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
    await expect(
      materializer.materializeExact({
        source: { ...resolved.source, package: 'fixture-other' },
        packageRoot: resolved.packageRoot,
        materializationDigest: resolved.materializationDigest,
        dependencyResolutionArtifact: resolved.dependencyResolutionArtifact,
      }),
    ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
  } finally {
    await resolved.cleanup()
  }
})

async function materializeResolutionArtifact(lockfile: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-hostile-lock-'))
  roots.push(root)
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      await mkdir(join(input.cwd, 'node_modules', 'fixture-hostile'), {
        recursive: true,
      })
      await writeFile(
        join(input.cwd, 'package.json'),
        JSON.stringify({ dependencies: { 'fixture-hostile': '1.0.0' } }),
      )
      await writeFile(
        join(input.cwd, 'node_modules', 'fixture-hostile', 'package.json'),
        JSON.stringify({ name: 'fixture-hostile', version: '1.0.0' }),
      )
      await writeFile(join(input.cwd, 'bun.lock'), JSON.stringify(lockfile))
    },
  })
  return materializer.materialize({
    kind: 'npm',
    requestedTarget: 'fixture-hostile@1',
  })
}

async function expectRejectedResolution(lockfile: unknown): Promise<void> {
  await expect(materializeResolutionArtifact(lockfile)).rejects.toMatchObject({
    code: 'extension_acquisition_failed',
  })
}

test.each([
  'internal',
  '127.0.0.1',
])('accepts a package-prefixed credential-free scp-like Git lock resolution for host %s', async (host) => {
  const result = await materializeResolutionArtifact({
    lockfileVersion: 1,
    packages: {
      nested: [`nested@git@${host}:repository.git`, {}, 'b'.repeat(40)],
    },
  })
  await result.cleanup()
})

test.each([
  'fixture@file:repository',
  '@scope/fixture@file:repository',
  'fixture@git:repository',
  '@scope/fixture@git:repository',
])('accepts the complete package protocol resolution %s', async (resolution) => {
  const result = await materializeResolutionArtifact({
    lockfileVersion: 1,
    packages: { nested: resolution },
  })
  await result.cleanup()
})

test.each([
  ['unknown lock format', { lockfileVersion: 2, packages: {} }],
  [
    'auth headers',
    {
      lockfileVersion: 1,
      headers: { authorization: 'Bearer ambient-secret' },
      packages: {},
    },
  ],
  [
    'traversing file dependency',
    {
      lockfileVersion: 1,
      packages: { hostile: ['file:../outside'] },
    },
  ],
  [
    'absolute file dependency',
    {
      lockfileVersion: 1,
      packages: { hostile: ['file:/outside'] },
    },
  ],
  [
    'unsupported URL protocol',
    {
      lockfileVersion: 1,
      packages: { hostile: ['ftp://example.test/package.tgz'] },
    },
  ],
  [
    'remote URL secret query data',
    {
      lockfileVersion: 1,
      packages: {
        hostile: ['https://example.test/package.tgz?token=ambient-secret'],
      },
    },
  ],
  ...[
    ['SSH password', 'git+ssh://git:secret@example.test/hostile.git'],
    ['non-git SSH user', 'git+ssh://user@example.test/hostile.git'],
    ['encoded SSH user', 'git+ssh://g%69t@example.test/hostile.git'],
    ['HTTPS userinfo', 'git+https://git@example.test/hostile.git'],
    ['scp-like internal host user', 'user@internal:hostile.git'],
    ['scp-like IPv4 host user', 'user@127.0.0.1:hostile.git'],
    ['scp-like protocol-named Git host user', 'user@git:hostile.git'],
    ['scp-like protocol-named file host user', 'user@file:hostile.git'],
  ].map(
    ([label, repository]) =>
      [
        label,
        {
          lockfileVersion: 1,
          packages: {
            hostile: [`hostile@${repository}`, {}, 'b'.repeat(40)],
          },
        },
      ] as const,
  ),
  [
    'embedded install scripts',
    {
      lockfileVersion: 1,
      packages: { hostile: { scripts: { install: 'run-me' } } },
    },
  ],
  [
    'mutable nested Git ref',
    {
      lockfileVersion: 1,
      packages: {
        hostile: [
          'hostile@git+https://example.test/hostile.git#main',
          {},
          'main',
        ],
      },
    },
  ],
] as const)('rejects %s in a dependency resolution artifact', async (_, lockfile) => {
  await expectRejectedResolution(lockfile)
})

test('package process uses a credential-free allowlisted environment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-package-env-'))
  roots.push(root)
  const observedPath = join(root, 'observed-env.json')
  const sentinels = {
    NPM_TOKEN: 'npm-sentinel',
    SSH_AUTH_SOCK: '/tmp/ssh-sentinel',
    HTTPS_PROXY: 'https://proxy-user:proxy-secret@example.test',
    BUN_AUTH_TOKEN: 'bun-sentinel',
    BUN_CONFIG: '/tmp/secret-bunfig.toml',
    GIT_ASKPASS_REQUIRE: 'force',
  }
  const overriddenConfig = {
    NPM_CONFIG_USERCONFIG: '/tmp/secret-npmrc',
    GIT_CONFIG_GLOBAL: '/tmp/secret-gitconfig',
  }
  const allowedConfig = {
    BUN_CONFIG_REGISTRY: 'http://127.0.0.1:4873/fixture',
  }
  const previous = Object.fromEntries(
    [
      ...Object.keys(sentinels),
      ...Object.keys(overriddenConfig),
      ...Object.keys(allowedConfig),
    ].map((key) => [key, process.env[key]]),
  )
  Object.assign(process.env, sentinels, overriddenConfig, allowedConfig)
  try {
    await runPackageProcess({
      executable: process.execPath,
      args: [
        '-e',
        `await Bun.write(${JSON.stringify(observedPath)}, JSON.stringify(process.env))`,
      ],
      cwd: root,
      timeoutMs: 5_000,
    })
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
  const observed = JSON.parse(await readFile(observedPath, 'utf8')) as Record<
    string,
    string
  >
  for (const key of Object.keys(sentinels))
    expect(observed[key]).toBeUndefined()
  expect(observed.GIT_TERMINAL_PROMPT).toBe('0')
  expect(observed.GIT_CONFIG_GLOBAL).toBe('/dev/null')
  expect(observed.npm_config_userconfig).toBe('/dev/null')
  expect(observed.NPM_CONFIG_USERCONFIG).toBeUndefined()
  expect(observed.BUN_CONFIG_REGISTRY).toBe(allowedConfig.BUN_CONFIG_REGISTRY)
  expect(observed.HOME).toBe(join(root, '.ctxindex-package-tmp'))
})

test.each([
  null,
  undefined,
])('wraps a nullish package-runner rejection as an acquisition failure', async (rejection) => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-runner-rejection-'))
  roots.push(root)
  const materializer = new BunPackageMaterializer({
    stagingParent: root,
    run: async () => {
      throw rejection
    },
  })

  await expect(
    materializer.materialize({
      kind: 'npm',
      requestedTarget: '@example/mail@^2',
    }),
  ).rejects.toMatchObject({
    code: 'extension_acquisition_failed',
    message: 'Extension package acquisition failed',
  })
})

test('package process bounds output, timeout, cancellation, and temporary state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-package-process-'))
  roots.push(root)
  await expect(
    runPackageProcess({
      executable: process.execPath,
      args: ['-e', "console.log('x'.repeat(70_000))"],
      cwd: root,
      timeoutMs: 5_000,
    }),
  ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
  await expect(
    runPackageProcess({
      executable: process.execPath,
      args: ['-e', 'await new Promise(() => {})'],
      cwd: root,
      timeoutMs: 20,
    }),
  ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })

  const controller = new AbortController()
  setTimeout(() => controller.abort(), 20)
  await expect(
    runPackageProcess({
      executable: process.execPath,
      args: ['-e', 'await new Promise(() => {})'],
      cwd: root,
      timeoutMs: 5_000,
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ code: 'cancelled' })
  expect(await Bun.file(join(root, '.ctxindex-package-tmp')).exists()).toBe(
    false,
  )
})
