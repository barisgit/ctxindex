import { expect, test } from 'bun:test'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

const repoRoot = resolve(import.meta.dir, '../../../..')
const cliBin = join(repoRoot, 'apps/cli/bin/ctxindex.mjs')
const extensionSourcePath = resolve(
  import.meta.dir,
  '../../../../examples/github-issues-extension',
)
function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse Source id from: ${stdout}`)
  return match[1]
}

function githubIssue(number: number) {
  return {
    number,
    title: `Pagination demo issue ${number}`,
    body: `Local GitHub issue body ${number}`,
    state: 'open',
    labels: [{ name: number === 1 ? 'daemon' : 'cli' }],
    created_at: `2026-01-0${number}T00:00:00Z`,
    updated_at: `2026-02-0${number}T00:00:00Z`,
    closed_at: null,
    html_url: `https://github.com/acme/widgets/issues/${number}`,
    user: { login: 'excluded' },
  }
}

test('external GitHub Issues Extension syncs mocked data for local paged search and get', async () => {
  const sandbox = await createSandbox()
  const extensionPath = join(sandbox.dir, 'compiled-github-issues-extension')
  const preloadPath = join(sandbox.dir, 'github-fetch-preload.ts')
  try {
    await mkdir(join(extensionPath, 'dist'), { recursive: true })
    const extensionBuild = await Bun.build({
      entrypoints: [join(extensionSourcePath, 'extension.ts')],
      outdir: join(extensionPath, 'dist'),
      target: 'bun',
      naming: 'extension.js',
    })
    expect(
      extensionBuild.success,
      extensionBuild.logs.map(String).join('\n'),
    ).toBe(true)
    await cp(
      join(extensionSourcePath, 'docs'),
      join(extensionPath, 'dist', 'docs'),
      { recursive: true },
    )
    await writeFile(
      join(extensionPath, 'package.json'),
      JSON.stringify({
        name: '@ctxindex/github-issues-e2e',
        version: '1.0.0',
        type: 'module',
        ctxindex: { extensions: ['./dist/extension.js'] },
      }),
    )

    const initialized = await sandbox.run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    await writeFile(
      join(sandbox.env.CTXINDEX_CONFIG_HOME, 'config.toml'),
      `[extensions]\npaths = ${JSON.stringify([extensionPath])}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`,
    )

    const realm = await sandbox.run(['realm', 'add', 'demo', '--name', 'Demo'])
    expect(realm.exitCode, realm.stderr).toBe(0)
    const added = await sandbox.run([
      'source',
      'add',
      'github.issues',
      '--realm',
      'demo',
      '--label',
      'github-demo',
      '--config-owner',
      'acme',
      '--config-repository',
      'widgets',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    const sourceId = parseSourceId(added.stdout)

    const expectedUrl =
      'https://api.github.com/repos/acme/widgets/issues?state=all&sort=updated&direction=desc&per_page=100'
    await writeFile(
      preloadPath,
      `const expectedUrl = ${JSON.stringify(expectedUrl)}
const issues = ${JSON.stringify([githubIssue(1), githubIssue(2), githubIssue(3)])}
globalThis.fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url !== expectedUrl) throw new Error('Unexpected provider request: ' + url)
  const headers = new Headers(init.headers)
  if (headers.get('authorization') !== null) throw new Error('Authorization header is forbidden')
  if (headers.get('accept') !== 'application/vnd.github+json') throw new Error('Missing GitHub Accept header')
  if (headers.get('user-agent') !== 'ctxindex-github-issues-demo/1') throw new Error('Missing GitHub User-Agent')
  if (headers.get('x-github-api-version') !== '2022-11-28') throw new Error('Missing GitHub API version')
  return Response.json(issues, { headers: { etag: '"e2e-single-page"' } })
}
`,
    )
    const syncProcess = Bun.spawn(
      [
        'bun',
        '--preload',
        preloadPath,
        cliBin,
        'sync',
        '--source',
        'github-demo',
        '--json',
      ],
      {
        cwd: repoRoot,
        env: sandbox.env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [syncExitCode, syncStdout, syncStderr] = await Promise.all([
      syncProcess.exited,
      new Response(syncProcess.stdout).text(),
      new Response(syncProcess.stderr).text(),
    ])
    expect(syncExitCode, syncStderr).toBe(0)
    expect(JSON.parse(syncStdout)).toMatchObject({
      mode: 'sync',
      results: [
        {
          sourceId,
          status: 'completed',
          run: {
            added: 3,
            updated: 0,
            deleted: 0,
            errorsCount: 0,
          },
        },
      ],
      warnings: [],
    })
    expect(syncStderr).toBe('')

    const firstPage = await sandbox.run([
      'search',
      'Pagination demo',
      '--source',
      'github-demo',
      '--local-only',
      '--limit',
      '1',
      '--offset',
      '0',
      '--json',
    ])
    expect(firstPage.exitCode, firstPage.stderr).toBe(0)
    const firstJson = JSON.parse(firstPage.stdout)
    expect(firstJson.results).toHaveLength(1)

    const secondPage = await sandbox.run([
      'search',
      'Pagination demo',
      '--source',
      'github-demo',
      '--local-only',
      '--limit',
      '1',
      '--offset',
      '1',
      '--json',
    ])
    expect(secondPage.exitCode, secondPage.stderr).toBe(0)
    const secondJson = JSON.parse(secondPage.stdout)
    expect(secondJson.results).toHaveLength(1)
    expect(secondJson.results[0].ref).not.toBe(firstJson.results[0].ref)

    const got = await sandbox.run(['get', firstJson.results[0].ref, '--json'])
    expect(got.exitCode, got.stderr).toBe(0)
    expect(JSON.parse(got.stdout)).toMatchObject({
      resource: {
        ref: firstJson.results[0].ref,
        sourceId,
        profile: { id: 'software.issue', version: 1 },
        origin: 'synced',
        payload: {
          number: expect.any(Number),
          title: expect.stringContaining('Pagination demo issue'),
          state: 'open',
        },
      },
      warnings: [],
    })
  } finally {
    await sandbox.cleanup()
  }
})
