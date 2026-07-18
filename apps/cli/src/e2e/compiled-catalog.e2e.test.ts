import { expect, test } from 'bun:test'
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../../', import.meta.url).pathname

async function runProcess(
  command: string[],
  options: { readonly cwd: string; readonly env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
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

test('relocated compiled CLI installs and loads a local Git Catalog Extension', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-catalog-'))
  const buildPath = join(sandbox, 'build', 'ctxindex')
  const relocatedPath = join(sandbox, 'relocated', 'ctxindex')
  const repository = join(sandbox, 'repository')
  try {
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    await mkdir(repository)
    expect(
      (await runProcess(['git', 'init', '-b', 'main'], { cwd: repository }))
        .exitCode,
    ).toBe(0)
    await writeFile(
      join(repository, 'extension.ts'),
      `export default ({ defineExtension }) => defineExtension({ id: 'fixture.compiled-catalog', version: 1, profiles: [], adapters: [] })\n`,
    )
    await writeFile(
      join(repository, 'ctxindex-catalog.json'),
      JSON.stringify({
        schemaVersion: 1,
        catalog: { id: 'fixture.compiled', name: 'Compiled Fixture' },
        extensions: [
          {
            id: 'fixture.compiled-catalog',
            version: 1,
            source: { kind: 'inline', path: 'extension.ts' },
          },
        ],
      }),
    )
    expect(
      (await runProcess(['git', 'add', '.'], { cwd: repository })).exitCode,
    ).toBe(0)
    expect(
      (
        await runProcess(
          [
            'git',
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.invalid',
            'commit',
            '-m',
            'compiled fixture',
          ],
          { cwd: repository },
        )
      ).exitCode,
    ).toBe(0)

    const build = await runProcess(
      [
        'bun',
        'build',
        '--compile',
        'apps/cli/bin/ctxindex.mjs',
        '--outfile',
        buildPath,
      ],
      { cwd: repoRoot },
    )
    expect(build.exitCode, `${build.stdout}\n${build.stderr}`).toBe(0)
    await Bun.write(relocatedPath, Bun.file(buildPath))
    await chmod(relocatedPath, 0o755)
    await rm(join(sandbox, 'build'), { recursive: true })

    const env = {
      ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
      CTXINDEX_CONFIG_HOME: join(sandbox, 'config'),
      CTXINDEX_DATA_HOME: join(sandbox, 'data'),
      CTXINDEX_STATE_HOME: join(sandbox, 'state'),
      CTXINDEX_CACHE_HOME: join(sandbox, 'cache'),
    }
    const run = (args: string[]) =>
      runProcess([relocatedPath, ...args], { cwd: '/', env })
    const added = await run([
      'extensions',
      'catalog',
      'add',
      'fixture',
      repository,
      '--ref',
      'refs/heads/main',
      '--trust',
      '--json',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    const commit = JSON.parse(added.stdout).commit
    const installed = await run([
      'extensions',
      'install',
      'fixture',
      'fixture.compiled-catalog@1',
      '--trust',
      '--json',
    ])
    expect(installed.exitCode, installed.stderr).toBe(0)
    expect(JSON.parse(installed.stdout).commit).toBe(commit)
    const list = await run(['extensions', 'list', '--json'])
    expect(list.exitCode, list.stderr).toBe(0)
    expect(JSON.parse(list.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'fixture.compiled-catalog',
          provenance: expect.objectContaining({
            kind: 'catalog',
            catalog: 'fixture',
            commit,
          }),
        }),
      ]),
    )
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
