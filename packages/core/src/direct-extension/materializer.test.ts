import { afterEach, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
      exact_version: '2.3.4',
      integrity: 'sha512-safe',
    })
  } finally {
    await result.cleanup()
  }
})

async function materializeGit(lockText: string) {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-git-materializer-'))
  roots.push(root)
  const materializer = new BunPackageMaterializer({
    stagingParent: join(root, 'managed'),
    run: async (input) => {
      await mkdir(join(input.cwd, 'node_modules', 'fixture-git-extension'), {
        recursive: true,
      })
      await writeFile(
        join(input.cwd, 'package.json'),
        JSON.stringify({
          dependencies: {
            'fixture-git-extension':
              'git+https://example.com/repository.git#main',
          },
        }),
      )
      await writeFile(
        join(
          input.cwd,
          'node_modules',
          'fixture-git-extension',
          'package.json',
        ),
        JSON.stringify({ name: 'fixture-git-extension', version: '1.0.0' }),
      )
      await writeFile(join(input.cwd, 'bun.lock'), lockText)
    },
  })
  return materializer.materialize({
    kind: 'git',
    requestedTarget: 'git+https://example.com/repository.git#main',
  })
}

test('Git materialization records the selected package tuple commit', async () => {
  const unrelatedCommit = 'a'.repeat(40)
  const commit = 'b'.repeat(40)
  const result = await materializeGit(`{
    "lockfileVersion": 1,
    "packages": {
      "unrelated": ["unrelated@git+https://example.com/unrelated.git", {}, "${unrelatedCommit}"],
      "fixture-git-extension": ["fixture-git-extension@git+https://example.com/repository.git", {}, "${commit}"],
    },
  }`)
  try {
    expect(result.source).toMatchObject({
      kind: 'git',
      requested_target: 'git+https://example.com/repository.git#main',
    })
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
    }`),
  ).rejects.toMatchObject({ code: 'extension_acquisition_failed' })
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
