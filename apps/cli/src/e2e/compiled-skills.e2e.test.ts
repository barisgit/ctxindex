import { expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../../', import.meta.url).pathname

test('relocated compiled CLI serves embedded bundled skills', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-skills-'))
  const buildPath = join(sandbox, 'build', 'ctxindex')
  const relocatedPath = join(sandbox, 'relocated', 'ctxindex')

  try {
    const build = Bun.spawn(
      [
        'bun',
        'build',
        '--compile',
        'apps/cli/bin/ctxindex.mjs',
        '--outfile',
        buildPath,
      ],
      { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
    )
    const [buildOutput, buildError, buildExitCode] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ])
    expect(buildExitCode, `${buildOutput}\n${buildError}`).toBe(0)

    await Bun.write(relocatedPath, Bun.file(buildPath))
    await chmod(relocatedPath, 0o755)
    await rm(join(sandbox, 'build'), { recursive: true })

    const run = async (args: string[]) => {
      const child = Bun.spawn([relocatedPath, ...args], {
        cwd: '/',
        env: {
          ...process.env,
          XDG_CONFIG_HOME: join(sandbox, 'config'),
          XDG_DATA_HOME: join(sandbox, 'data'),
          XDG_STATE_HOME: join(sandbox, 'state'),
          XDG_CACHE_HOME: join(sandbox, 'cache'),
        },
        stdin: null,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, exitCode }
    }

    const list = await run(['skills', 'list'])
    expect(list.exitCode).toBe(0)
    expect(list.stderr).toBe('')
    expect(list.stdout).toContain('getting-started\t')
    expect(list.stdout).not.toContain('reference/cli-overview\t')
    expect(list.stdout).not.toContain('README\t')

    const listJson = await run(['skills', 'list', '--json'])
    expect(listJson.exitCode).toBe(0)
    expect(JSON.parse(listJson.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'getting-started' }),
      ]),
    )

    const get = await run(['skills', 'get', 'getting-started'])
    expect(get.exitCode).toBe(0)
    expect(get.stdout).toContain('# Getting started with ctxindex')
    expect(get.stdout).toContain('ctxindex client add <provider> --from-env')
    expect(get.stdout).not.toMatch(/ctxindex auth\b/)

    const getJson = await run([
      'skills',
      'get',
      'getting-started',
      '--inline',
      '--json',
    ])
    expect(getJson.exitCode).toBe(0)
    const document = JSON.parse(getJson.stdout) as { content: string }
    expect(document.content).toContain(
      '--- inlined: reference/cli-overview ---',
    )
    expect(document.content).toContain('# CLI overview')

    const path = await run(['skills', 'path'])
    expect(path).toEqual({
      exitCode: 0,
      stderr: '',
      stdout: 'embedded://ctxindex/skills\n',
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
