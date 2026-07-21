import { expect, test } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../../', import.meta.url).pathname

test('relocated compiled CLI serves product documentation offline', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-docs-'))
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
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
      build.exited,
    ])
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0)
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
      const [commandOut, commandErr, commandExit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout: commandOut, stderr: commandErr, exitCode: commandExit }
    }

    const list = await run(['docs', 'list', '--format', 'json'])
    expect(list.exitCode, list.stderr).toBe(0)
    expect(JSON.parse(list.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          origin: 'bundled',
          path: 'getting-started.md',
        }),
      ]),
    )
    const get = await run(['docs', 'get', 'getting-started.md'])
    expect(get.exitCode, get.stderr).toBe(0)
    expect(get.stdout).toContain('Getting started')
    const extensionGet = await run([
      'docs',
      'get',
      'README.md',
      '--extension',
      'ctxindex.local',
    ])
    expect(extensionGet.exitCode, extensionGet.stderr).toBe(0)
    expect(extensionGet.stdout).toContain('# Local directory')
    const search = await run(['docs', 'search', 'Realm', '--format', 'json'])
    expect(search.exitCode, search.stderr).toBe(0)
    expect(JSON.parse(search.stdout).length).toBeGreaterThan(0)
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
