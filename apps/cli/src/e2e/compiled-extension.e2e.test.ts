import { expect, test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const fixtureDir = join(import.meta.dir, 'fixtures', 'compiled-extension')
const extensionSdkDir = resolve(
  import.meta.dir,
  '../../../../packages/extension-sdk',
)

test('relocated compiled host loads an external TypeScript Extension', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-extension-'))
  const buildPath = join(sandbox, 'build', 'host')
  const relocatedPath = join(sandbox, 'relocated', 'host')
  const externalPath = join(sandbox, 'external')
  const installTempPath = join(sandbox, 'tmp')

  try {
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    await mkdir(installTempPath, { recursive: true })
    await cp(join(fixtureDir, 'external'), externalPath, { recursive: true })
    await cp(join(fixtureDir, 'dependency'), join(sandbox, 'dependency'), {
      recursive: true,
    })

    const install = Bun.spawn(
      [
        'bun',
        'add',
        '--cwd',
        externalPath,
        `@ctxindex/extension-sdk@file:${extensionSdkDir}`,
        '--offline',
        '--backend=copyfile',
      ],
      {
        env: {
          ...process.env,
          TMPDIR: installTempPath,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [installStdout, installStderr, installExitCode] = await Promise.all([
      new Response(install.stdout).text(),
      new Response(install.stderr).text(),
      install.exited,
    ])
    expect(installExitCode, `${installStdout}\n${installStderr}`).toBe(0)

    const packageBuild = Bun.spawn(
      [
        'bun',
        'build',
        join(externalPath, 'extension.ts'),
        '--outfile',
        join(externalPath, 'dist', 'extension.js'),
        '--target=bun',
      ],
      { cwd: externalPath, stdout: 'pipe', stderr: 'pipe' },
    )
    const [packageStdout, packageStderr, packageExitCode] = await Promise.all([
      new Response(packageBuild.stdout).text(),
      new Response(packageBuild.stderr).text(),
      packageBuild.exited,
    ])
    expect(packageExitCode, `${packageStdout}\n${packageStderr}`).toBe(0)

    const build = Bun.spawn(
      [
        'bun',
        'build',
        '--compile',
        join(fixtureDir, 'host.ts'),
        '--outfile',
        buildPath,
      ],
      { cwd: fixtureDir, stdout: 'pipe', stderr: 'pipe' },
    )
    const [buildStdout, buildStderr, buildExitCode] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ])
    expect(buildExitCode, `${buildStdout}\n${buildStderr}`).toBe(0)

    await cp(buildPath, relocatedPath)
    await chmod(relocatedPath, 0o755)
    await rm(join(sandbox, 'build'), { recursive: true })

    const run = Bun.spawn([relocatedPath, externalPath], {
      cwd: externalPath,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ])

    expect(exitCode, stderr).toBe(0)
    expect(stderr).toBe('')
    expect(JSON.parse(stdout)).toEqual({
      id: 'fixture.extension',
      adapters: ['fixture.adapter.typescript-runtime-dependency-ok'],
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
