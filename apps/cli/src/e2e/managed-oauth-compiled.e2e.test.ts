import { expect, test } from 'bun:test'
import { chmod, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const fixtureDir = join(import.meta.dir, 'fixtures', 'managed-oauth')

test('relocated compiled host preserves generic managed OAuth acceptance offline', async () => {
  expect(Bun.version).toBe('1.3.14')
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-managed-oauth-'))
  const buildPath = join(sandbox, 'build', 'host')
  const relocatedPath = join(sandbox, 'relocated', 'host')

  try {
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    const build = Bun.spawn(
      [
        'bun',
        'build',
        '--compile',
        join(fixtureDir, 'host.ts'),
        '--outfile',
        buildPath,
      ],
      { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
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

    const run = Bun.spawn([relocatedPath], {
      cwd: sandbox,
      env: {
        PATH: process.env.PATH,
        HOME: sandbox,
        BUN_CONFIG_NO_NETWORK: '1',
      },
      stdin: null,
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
    expect(stdout).not.toMatch(
      /synthetic-public-client|synthetic-local-client|synthetic-token|synthetic-refresh|config_ref/i,
    )
    expect(JSON.parse(stdout)).toEqual({
      managedSelection: {
        status: 'selected',
        providerId: 'synthetic.oauth',
        label: 'managed',
      },
      provenanceMismatch: {
        status: 'unavailable',
        providerId: 'synthetic.oauth',
        reason: 'provenance_mismatch',
      },
      inventory: [
        {
          providerId: 'synthetic.oauth',
          label: 'local',
          origin: 'local',
          provenance: { kind: 'local' },
        },
        {
          providerId: 'synthetic.oauth',
          label: 'managed',
          origin: 'extension',
          provenance: {
            kind: 'extension',
            source: 'builtin',
            packageName: '@ctxindex/official',
          },
        },
      ],
      requestedScopes: [
        'community.read',
        'managed.read',
        'openid',
        'shared.read',
      ],
      managedScopes: [
        'community.read',
        'managed.read',
        'openid',
        'shared.read',
      ],
      localScopes: ['community.read', 'managed.read', 'openid', 'shared.read'],
      requestHosts: [
        'auth.synthetic.invalid',
        'api.synthetic.invalid',
        'auth.synthetic.invalid',
        'api.synthetic.invalid',
      ],
    })
  } finally {
    await rm(sandbox, { recursive: true, force: true })
  }
}, 30_000)
