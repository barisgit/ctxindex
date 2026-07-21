import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const demoPackageRoot = join(repoRoot, 'examples/tenders-extension')

async function runProcess(
  command: readonly string[],
  options: {
    readonly cwd: string
    readonly env?: Readonly<Record<string, string | undefined>>
  },
) {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    ...(options.env === undefined ? {} : { env: options.env }),
    stdin: 'ignore',
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

test('relocated compiled CLI installs and uses the exact packed demo artifact', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-packed-demo-'))
  const buildPath = join(sandbox, 'build', 'ctxindex')
  const relocatedPath = join(sandbox, 'relocated', 'ctxindex')
  const tarballs = join(sandbox, 'tarballs')
  const extracted = join(sandbox, 'extracted')
  const packageRoot = join(extracted, 'package')
  const tarball = join(tarballs, 'ctxindex-demo-tenders-0.1.0.tgz')
  const server = createServer(async (request, response) => {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const path = decodeURIComponent(new URL(request.url ?? '/', base).pathname)
    if (path === '/@ctxindex/demo-tenders') {
      const bytes = new Uint8Array(await readFile(tarball))
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: '@ctxindex/demo-tenders',
          'dist-tags': { latest: '0.1.0' },
          versions: {
            '0.1.0': {
              name: '@ctxindex/demo-tenders',
              version: '0.1.0',
              dist: {
                tarball: `${base}/ctxindex-demo-tenders-0.1.0.tgz`,
                integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
              },
            },
          },
        }),
      )
      return
    }
    if (path === '/ctxindex-demo-tenders-0.1.0.tgz') {
      response.setHeader('content-type', 'application/octet-stream')
      response.end(await readFile(tarball))
      return
    }
    response.writeHead(404)
    response.end('not found')
  })

  try {
    await mkdir(join(sandbox, 'build'), { recursive: true })
    await mkdir(join(sandbox, 'relocated'), { recursive: true })
    await mkdir(tarballs, { recursive: true })
    await mkdir(extracted, { recursive: true })

    const packed = await runProcess(
      ['bun', 'pm', 'pack', '--destination', tarballs],
      { cwd: demoPackageRoot },
    )
    expect(packed.exitCode, packed.stderr).toBe(0)
    expect(await Bun.file(tarball).exists()).toBe(true)

    const unpacked = await runProcess(
      ['tar', '-xzf', tarball, '-C', extracted],
      { cwd: sandbox },
    )
    expect(unpacked.exitCode, unpacked.stderr).toBe(0)
    expect(
      await Bun.file(join(packageRoot, 'demo-extension.js')).exists(),
    ).toBe(true)
    expect(await Bun.file(join(packageRoot, 'extension.ts')).exists()).toBe(
      false,
    )
    expect(await Bun.file(join(packageRoot, 'node_modules')).exists()).toBe(
      false,
    )

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const built = await runProcess(
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
    expect(built.exitCode, `${built.stdout}\n${built.stderr}`).toBe(0)
    await Bun.write(relocatedPath, Bun.file(buildPath))
    await chmod(relocatedPath, 0o755)

    const env = {
      ...process.env,
      NODE_ENV: 'test',
      CTXINDEX_CONFIG_HOME: join(sandbox, 'config'),
      CTXINDEX_DATA_HOME: join(sandbox, 'data'),
      CTXINDEX_STATE_HOME: join(sandbox, 'state'),
      CTXINDEX_CACHE_HOME: join(sandbox, 'cache'),
      CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox, 'keytar.json'),
      BUN_CONFIG_REGISTRY: registry,
    }
    const run = (args: readonly string[]) =>
      runProcess([relocatedPath, ...args], { cwd: '/', env })

    expect((await run(['init'])).exitCode).toBe(0)
    const installed = await run([
      'extension',
      'install',
      'npm',
      '@ctxindex/demo-tenders@0.1.0',
      'ctxindex.demo',
      '--json',
    ])
    expect(installed.exitCode, installed.stderr).toBe(0)
    expect(JSON.parse(installed.stdout)).toMatchObject({
      action: 'installed',
      id: 'ctxindex.demo',
      source: { kind: 'npm', exact_version: '0.1.0' },
    })

    expect(
      (await run(['realm', 'add', 'demo', '--name', 'Instant demo'])).exitCode,
    ).toBe(0)
    const added = await run([
      'source',
      'add',
      'ctxindex.demo.tenders',
      '--realm',
      'demo',
      '--label',
      'demo-tenders',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    const sourceId = /^source added: (.+)$/m.exec(added.stdout)?.[1]
    expect(sourceId).toBeDefined()

    const synced = await run(['sync', '--source', 'demo-tenders', '--json'])
    expect(synced.exitCode, synced.stderr).toBe(0)
    expect(JSON.parse(synced.stdout)).toMatchObject({
      results: [
        {
          sourceId,
          status: 'completed',
          run: { added: 8, updated: 0, deleted: 0, errorsCount: 0 },
        },
      ],
      warnings: [],
    })

    const searched = await run([
      'search',
      'cybersecurity',
      '--realm',
      'demo',
      '--kind',
      'ctxindex.demo.tender',
      '--field',
      'status=open',
      '--json',
    ])
    expect(searched.exitCode, searched.stderr).toBe(0)
    const ref = `ctx://${sourceId}/tender/DEMO-2026-001`
    expect(JSON.parse(searched.stdout)).toMatchObject({
      results: [
        {
          ref,
          title: 'Cybersecurity incident response retainer',
          profile: { id: 'ctxindex.demo.tender', version: 1 },
        },
      ],
      warnings: [],
    })

    const got = await run(['get', ref, '--json'])
    expect(got.exitCode, got.stderr).toBe(0)
    expect(JSON.parse(got.stdout)).toMatchObject({
      resource: {
        ref,
        origin: 'synced',
        payload: {
          reference: 'DEMO-2026-001',
          status: 'open',
          category: 'cybersecurity services',
          currency: 'EUR',
          estimatedValue: 480000,
        },
      },
      warnings: [],
    })
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(sandbox, { recursive: true, force: true })
  }
}, 120_000)
