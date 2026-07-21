import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repoRoot = new URL('../../../../', import.meta.url).pathname
const fixtureRoot = join(import.meta.dir, 'fixtures', 'direct-extension')

interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

async function runProcess(
  command: readonly string[],
  options: {
    readonly cwd: string
    readonly env?: Readonly<Record<string, string | undefined>>
  },
): Promise<ProcessResult> {
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

async function createTarball(
  source: string,
  destination: string,
  sandbox: string,
): Promise<void> {
  const staging = await mkdtemp(join(sandbox, 'pack-'))
  try {
    await cp(source, join(staging, 'package'), { recursive: true })
    const packed = await runProcess(
      ['tar', '-czf', destination, '-C', staging, 'package'],
      { cwd: sandbox },
    )
    expect(packed.exitCode, packed.stderr).toBe(0)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

function integrity(bytes: Uint8Array): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

test('relocated compiled CLI manages direct npm, Git, and local pins offline', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ctxindex-compiled-direct-'))
  const buildPath = join(sandbox, 'build', 'ctxindex')
  const relocatedPath = join(sandbox, 'relocated', 'ctxindex')
  const packages = join(sandbox, 'packages')
  const localPackage = join(packages, 'local')
  const gitPackage = join(packages, 'git')
  const gitBare = join(sandbox, 'repo.git')
  const npmPackage = join(packages, 'npm')
  const dependencyPackage = join(packages, 'dependency')
  const tarballs = join(sandbox, 'tarballs')
  const npmTarballV1 = join(tarballs, 'fixture-direct-npm-1.0.0.tgz')
  const dependencyTarball = join(
    tarballs,
    'fixture-direct-dependency-1.0.0.tgz',
  )
  let registryEnabled = true
  let registryRequests = 0
  const npmVersions = new Map<string, string>()

  const server = createServer(async (request, response) => {
    registryRequests++
    if (!registryEnabled) {
      response.writeHead(503)
      response.end('registry disabled')
      return
    }
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const requestPath = new URL(request.url ?? '/', base).pathname
    if (requestPath.startsWith('/repo.git/')) {
      const relative = requestPath.slice('/repo.git/'.length)
      if (relative.includes('..')) {
        response.writeHead(400)
        response.end('invalid path')
        return
      }
      const file = join(gitBare, relative)
      if (await Bun.file(file).exists()) {
        response.setHeader(
          'content-type',
          relative === 'info/refs' || relative === 'HEAD'
            ? 'text/plain'
            : 'application/octet-stream',
        )
        response.end(await readFile(file))
        return
      }
      response.writeHead(404)
      response.end('not found')
      return
    }
    if (request.url === '/fixture-direct-npm') {
      const versions = Object.fromEntries(
        await Promise.all(
          [...npmVersions.entries()].map(async ([version, filename]) => [
            version,
            {
              name: 'fixture-direct-npm',
              version,
              dependencies: { 'fixture-direct-dependency': '1.0.0' },
              dist: {
                tarball: `${base}/${filename}`,
                integrity: integrity(
                  new Uint8Array(await readFile(join(tarballs, filename))),
                ),
              },
            },
          ]),
        ),
      )
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: 'fixture-direct-npm',
          'dist-tags': { latest: [...npmVersions.keys()].at(-1) },
          versions,
        }),
      )
      return
    }
    if (request.url === '/fixture-direct-dependency') {
      const bytes = new Uint8Array(await readFile(dependencyTarball))
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          name: 'fixture-direct-dependency',
          'dist-tags': { latest: '1.0.0' },
          versions: {
            '1.0.0': {
              name: 'fixture-direct-dependency',
              version: '1.0.0',
              dist: {
                tarball: `${base}/fixture-direct-dependency-1.0.0.tgz`,
                integrity: integrity(bytes),
              },
            },
          },
        }),
      )
      return
    }
    const tarball = request.url?.startsWith('/')
      ? join(tarballs, request.url.slice(1))
      : undefined
    if (tarball !== undefined && (await Bun.file(tarball).exists())) {
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
    await mkdir(packages, { recursive: true })
    await mkdir(tarballs, { recursive: true })
    await cp(join(fixtureRoot, 'local'), localPackage, { recursive: true })
    await cp(join(fixtureRoot, 'git'), gitPackage, { recursive: true })
    await cp(join(fixtureRoot, 'npm'), npmPackage, { recursive: true })
    await cp(join(fixtureRoot, 'dependency'), dependencyPackage, {
      recursive: true,
    })
    const localBuild = await runProcess(
      [
        'bun',
        'build',
        join(fixtureRoot, 'local', 'extension.ts'),
        '--outfile',
        join(localPackage, 'dist', 'extension.js'),
        '--target=bun',
      ],
      { cwd: repoRoot },
    )
    expect(localBuild.exitCode, localBuild.stderr).toBe(0)
    await createTarball(dependencyPackage, dependencyTarball, sandbox)
    await createTarball(npmPackage, npmTarballV1, sandbox)
    npmVersions.set('1.0.0', 'fixture-direct-npm-1.0.0.tgz')

    expect(
      (await runProcess(['git', 'init', '-b', 'main'], { cwd: gitPackage }))
        .exitCode,
    ).toBe(0)
    expect(
      (await runProcess(['git', 'add', '.'], { cwd: gitPackage })).exitCode,
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
            'git v1',
          ],
          { cwd: gitPackage },
        )
      ).exitCode,
    ).toBe(0)
    expect(
      (
        await runProcess(['git', 'clone', '--bare', gitPackage, gitBare], {
          cwd: sandbox,
        })
      ).exitCode,
    ).toBe(0)
    expect(
      (
        await runProcess(['git', '--git-dir', gitBare, 'update-server-info'], {
          cwd: sandbox,
        })
      ).exitCode,
    ).toBe(0)

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const registry = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
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

    const baseEnv = {
      ...process.env,
      NODE_ENV: 'test',
      CTXINDEX_CONFIG_HOME: join(sandbox, 'config'),
      CTXINDEX_DATA_HOME: join(sandbox, 'data'),
      CTXINDEX_STATE_HOME: join(sandbox, 'state'),
      CTXINDEX_CACHE_HOME: join(sandbox, 'cache'),
      CTXINDEX_KEYTAR_MOCK_FILE: join(sandbox, 'keytar.json'),
      BUN_CONFIG_REGISTRY: registry,
    }
    const run = (args: readonly string[], env = baseEnv) =>
      runProcess([relocatedPath, ...args], { cwd: '/', env })

    const invalid = await run([
      'extension',
      'install',
      'npm',
      'fixture@../local',
      'fixture.invalid',
      '--json',
    ])
    expect(invalid.exitCode).toBe(2)
    expect(registryRequests).toBe(0)
    const credentialed = await run([
      'extension',
      'install',
      'git',
      'git+https://user:secret@example.invalid/repository.git',
      'fixture.invalid',
      '--json',
    ])
    expect(credentialed.exitCode).toBe(2)
    expect(registryRequests).toBe(0)

    expect((await run(['init'])).exitCode).toBe(0)
    const npmInstalled = await run([
      'extension',
      'install',
      'npm',
      'fixture-direct-npm@^1',
      'fixture.direct.npm',
      '--json',
    ])
    expect(npmInstalled.exitCode, npmInstalled.stderr).toBe(0)
    const npmV1 = JSON.parse(npmInstalled.stdout)
    const npmResolvedIdentity = `${npmV1.source.exact_version} (${npmV1.source.integrity})`
    expect(npmV1.action).toBe('installed')
    expect(npmV1.id).toBe('fixture.direct.npm')
    expect(npmV1.source.kind).toBe('npm')
    expect(npmResolvedIdentity).toContain('1.0.0')
    expect(npmResolvedIdentity).toContain('sha512-')
    expect(
      await Bun.file(
        join(
          baseEnv.CTXINDEX_DATA_HOME,
          'direct-extensions',
          'materializations',
          npmV1.materialization_digest,
          'node_modules',
          'fixture-direct-npm',
          'lifecycle-ran',
        ),
      ).exists(),
    ).toBe(false)

    const gitInstalled = await run([
      'extension',
      'install',
      'git',
      `git+${registry}/repo.git#main`,
      'fixture.direct.git',
      '--json',
    ])
    expect(gitInstalled.exitCode, gitInstalled.stderr).toBe(0)
    const gitV1 = JSON.parse(gitInstalled.stdout)
    const gitResolvedIdentity = String(gitV1.source.commit)
    expect(gitV1.action).toBe('installed')
    expect(gitV1.id).toBe('fixture.direct.git')
    expect(gitV1.source.kind).toBe('git')
    expect(gitResolvedIdentity).toMatch(/^[0-9a-f]{40,64}$/)

    const localInstalled = await run([
      'extension',
      'install',
      'local',
      localPackage,
      'fixture.direct.local',
      '--json',
    ])
    expect(localInstalled.exitCode, localInstalled.stderr).toBe(0)
    const localV1 = JSON.parse(localInstalled.stdout)
    expect(localV1).toMatchObject({
      action: 'installed',
      id: 'fixture.direct.local',
      source: { kind: 'local' },
    })

    await writeFile(
      join(gitPackage, 'extension.js'),
      (await readFile(join(gitPackage, 'extension.js'), 'utf8')).replace(
        'git-v1',
        'git-v2',
      ),
    )
    expect(
      (await runProcess(['git', 'add', 'extension.js'], { cwd: gitPackage }))
        .exitCode,
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
            'git v2',
          ],
          { cwd: gitPackage },
        )
      ).exitCode,
    ).toBe(0)
    expect(
      (
        await runProcess(
          [
            'git',
            '--git-dir',
            gitBare,
            'fetch',
            gitPackage,
            '+refs/heads/main:refs/heads/main',
          ],
          { cwd: sandbox },
        )
      ).exitCode,
    ).toBe(0)
    expect(
      (
        await runProcess(['git', '--git-dir', gitBare, 'update-server-info'], {
          cwd: sandbox,
        })
      ).exitCode,
    ).toBe(0)
    await writeFile(
      join(localPackage, 'dist', 'extension.js'),
      (
        await readFile(join(localPackage, 'dist', 'extension.js'), 'utf8')
      ).replace('local-v1', 'local-v2'),
    )

    const npmUpdated = await run([
      'extension',
      'update',
      'fixture.direct.npm',
      '--json',
    ])
    expect(npmUpdated.exitCode, npmUpdated.stderr).toBe(0)
    expect(JSON.parse(npmUpdated.stdout)).toMatchObject({
      action: 'updated',
      materialization_digest: npmV1.materialization_digest,
    })
    const gitUpdated = await run([
      'extension',
      'update',
      'fixture.direct.git',
      '--json',
    ])
    expect(gitUpdated.exitCode, gitUpdated.stderr).toBe(0)
    expect(JSON.parse(gitUpdated.stdout).source.commit).not.toBe(
      gitResolvedIdentity,
    )
    const localUpdated = await run([
      'extension',
      'update',
      'fixture.direct.local',
      '--json',
    ])
    expect(localUpdated.exitCode, localUpdated.stderr).toBe(0)
    expect(JSON.parse(localUpdated.stdout).materialization_digest).not.toBe(
      localV1.materialization_digest,
    )

    expect((await run(['realm', 'add', 'work'])).exitCode).toBe(0)
    const database = new Database(
      join(baseEnv.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    )
    try {
      database
        .prepare(
          `INSERT INTO sources
             (id, realm_id, adapter_id, label, config_json, sync_enabled, search_routing, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'indexed', ?, ?)`,
        )
        .run(
          '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          'work',
          'fixture.direct.local-adapter',
          'fixture-source',
          '{}',
          Date.now(),
          Date.now(),
        )
      const resourceRef = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/file/offline-note'
      const timestamp = Date.now()
      database
        .prepare(
          `INSERT INTO resources
             (id, ref, source_id, realm_id, profile_id, profile_version,
              title, origin, payload_json, hydrated_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'file', 1, ?, 'synced', ?, ?, ?, ?)`,
        )
        .run(
          'fixture-resource-id',
          resourceRef,
          '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          'work',
          'offline-note.txt',
          JSON.stringify({
            path: 'offline-note.txt',
            name: 'offline-note.txt',
            mediaType: 'text/plain',
            byteSize: 12,
            modifiedAt: '2026-07-20T00:00:00.000Z',
            contentHash: `sha256:${'a'.repeat(64)}`,
            text: 'offline note',
          }),
          timestamp,
          timestamp,
          timestamp,
        )
    } finally {
      database.close()
    }

    await rm(packages, { recursive: true, force: true })
    await rm(gitBare, { recursive: true, force: true })
    registryEnabled = false
    const requestsBeforeOffline = registryRequests
    const offlineEnv = {
      ...baseEnv,
      PATH: join(sandbox, 'missing-tools'),
      BUN_CONFIG_REGISTRY: 'http://127.0.0.1:1',
    }
    const recordsPath = join(
      baseEnv.CTXINDEX_CONFIG_HOME,
      'direct-extensions.json',
    )
    const materializationsPath = join(
      baseEnv.CTXINDEX_DATA_HOME,
      'direct-extensions',
      'materializations',
    )
    const recordsBeforeReads = await readFile(recordsPath, 'utf8')
    const materializationsBeforeReads = (
      await readdir(materializationsPath)
    ).sort()
    const resourceRef = 'ctx://01ARZ3NDEKTSV4RRFFQ69G5FAV/file/offline-note'
    for (const args of [
      ['extension', 'list', '--json'],
      ['describe', 'adapter', 'fixture.direct.local-adapter', '--json'],
      ['oauth-app', 'list', '--json'],
      ['account', 'list', '--json'],
      ['realm', 'list', '--json'],
      ['source', 'list', '--json'],
      ['status', '--source', 'fixture-source', '--json'],
      [
        'search',
        'offline',
        '--source',
        'fixture-source',
        '--local-only',
        '--json',
      ],
      [
        'describe',
        'action',
        'communication.message.draft.create',
        '--source',
        'fixture-source',
        '--json',
      ],
      ['sync', '--json'],
      ['get', '--json', resourceRef],
      ['export', '--format', 'json', resourceRef],
      ['thread', '--json', resourceRef],
      ['artifact', 'list', '--json', resourceRef],
      ['extension', 'catalog', 'list', '--no-refresh', '--json'],
      ['skills', 'list', '--json'],
    ]) {
      const result = await run(args, offlineEnv)
      expect(result.exitCode, `${args.join(' ')}\n${result.stderr}`).toBe(0)
      expect(() => JSON.parse(result.stdout)).not.toThrow()
    }
    expect(await readFile(recordsPath, 'utf8')).toBe(recordsBeforeReads)
    expect((await readdir(materializationsPath)).sort()).toEqual(
      materializationsBeforeReads,
    )
    expect(registryRequests).toBe(requestsBeforeOffline)

    const blocked = await run(
      ['extension', 'uninstall', 'fixture.direct.local', '--json'],
      offlineEnv,
    )
    expect(blocked.exitCode).toBe(2)
    expect(blocked.stderr).toContain('fixture-source')
    const forced = await run(
      ['extension', 'uninstall', 'fixture.direct.local', '--force', '--json'],
      offlineEnv,
    )
    expect(forced.exitCode, forced.stderr).toBe(0)
    expect(JSON.parse(forced.stdout).blockingSources).toEqual([
      expect.objectContaining({ label: 'fixture-source' }),
    ])
    const unavailable = await run(['source', 'list', '--json'], offlineEnv)
    expect(JSON.parse(unavailable.stdout)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'fixture-source',
          availability: 'extension_unavailable',
        }),
      ]),
    )
  } finally {
    registryEnabled = false
    server.closeAllConnections()
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    await rm(sandbox, { recursive: true, force: true })
  }
}, 90_000)
