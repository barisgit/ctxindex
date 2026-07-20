import { expect, test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fixtureDir = join(import.meta.dir, 'fixtures', 'compiled-extension')

test('relocated compiled host loads an external TypeScript Extension', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-extension-'))
  const buildPath = join(sandbox, 'build', 'host')
  const relocatedPath = join(sandbox, 'relocated', 'host')
  const externalPath = join(sandbox, 'external')

  try {
    await mkdir(join(externalPath, 'node_modules'), { recursive: true })
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    await cp(join(fixtureDir, 'external'), externalPath, { recursive: true })
    await cp(
      join(fixtureDir, 'dependency'),
      join(externalPath, 'node_modules', 'extension-fixture-dep'),
      { recursive: true },
    )

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

    const run = Bun.spawn([relocatedPath, join(externalPath, 'extension.ts')], {
      cwd: '/',
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
      adapter: { id: 'fixture.adapter', hostVersion: 'fixture-host-v1' },
      probe: 'typescript-runtime-dependency-ok',
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
