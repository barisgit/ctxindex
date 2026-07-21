import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const extensionSourceRoot = join(repoRoot, 'examples/tenders-extension')

test('relocated compiled CLI syncs external tenders through generic verbs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-tenders-e2e-'))
  const buildOutput = join(root, 'build', 'ctxindex')
  const relocatedBinary = join(root, 'relocated', 'ctxindex')
  const extensionPath = join(root, 'extension-package')
  const xdgConfig = join(root, 'xdg', 'config')
  const xdgData = join(root, 'xdg', 'data')
  const xdgState = join(root, 'xdg', 'state')
  const xdgCache = join(root, 'xdg', 'cache')
  const configPath = join(xdgConfig, 'ctxindex', 'config.toml')
  const configText = (paths: string[]) =>
    `[extensions]\npaths = ${JSON.stringify(paths)}\n\n[secrets]\nbackend = "keychain"\n\n[log]\nlevel = "info"\n\n[log.file]\nrotate = "daily"\nretain_days = 14\ncompress = true\n`
  const env = {
    HOME: join(root, 'home'),
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
    XDG_STATE_HOME: xdgState,
    XDG_CACHE_HOME: xdgCache,
    CTXINDEX_KEYTAR_MOCK_FILE: join(root, 'keytar.json'),
  }

  async function run(args: string[]) {
    const proc = Bun.spawn([relocatedBinary, ...args], {
      cwd: '/',
      env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    return { exitCode, stdout, stderr }
  }

  try {
    await mkdir(join(root, 'build'), { recursive: true })
    const build = Bun.spawn(
      [
        'bun',
        'build',
        '--compile',
        'apps/cli/bin/ctxindex.mjs',
        '--outfile',
        buildOutput,
      ],
      { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
    )
    const [buildExitCode, buildStdout, buildStderr] = await Promise.all([
      build.exited,
      new Response(build.stdout).text(),
      new Response(build.stderr).text(),
    ])
    expect(buildExitCode, `${buildStdout}\n${buildStderr}`).toBe(0)

    await mkdir(join(extensionPath, 'dist'), { recursive: true })
    const extensionBuild = Bun.spawn(
      [
        'bun',
        'build',
        join(extensionSourceRoot, 'extension.ts'),
        '--outfile',
        join(extensionPath, 'dist', 'extension.js'),
        '--target=bun',
      ],
      { cwd: repoRoot, stdout: 'pipe', stderr: 'pipe' },
    )
    const [extensionBuildExitCode, extensionBuildStdout, extensionBuildStderr] =
      await Promise.all([
        extensionBuild.exited,
        new Response(extensionBuild.stdout).text(),
        new Response(extensionBuild.stderr).text(),
      ])
    expect(
      extensionBuildExitCode,
      `${extensionBuildStdout}\n${extensionBuildStderr}`,
    ).toBe(0)
    await cp(
      join(extensionSourceRoot, 'docs'),
      join(extensionPath, 'dist/docs'),
      {
        recursive: true,
      },
    )
    await writeFile(
      join(extensionPath, 'package.json'),
      JSON.stringify({
        name: '@ctxindex/tenders-e2e-package',
        version: '1.0.0',
        type: 'module',
        ctxindex: { extensions: ['./dist/extension.js'] },
      }),
    )

    await mkdir(join(root, 'relocated'), { recursive: true })
    await copyFile(buildOutput, relocatedBinary)
    expect(relocatedBinary).not.toBe(buildOutput)
    expect(extensionSourceRoot.startsWith(join(repoRoot, 'examples'))).toBe(
      true,
    )
    expect(extensionSourceRoot.startsWith(join(repoRoot, 'packages'))).toBe(
      false,
    )
    expect(extensionPath.startsWith(join(root, 'relocated'))).toBe(false)

    const initialized = await run(['init'])
    expect(initialized.exitCode, initialized.stderr).toBe(0)
    expect(initialized.stdout).toBe('ctxindex initialized\n')
    expect(initialized.stderr).toBe('')

    await writeFile(configPath, configText([extensionPath]))

    const help = await run(['--help'])
    expect(help.exitCode, help.stderr).toBe(0)
    expect(help.stderr).toBe('')
    expect(help.stdout).not.toContain('\n  tender ')

    const realm = await run(['realm', 'add', 'demo'])
    expect(realm.exitCode, realm.stderr).toBe(0)
    expect(realm.stdout).toBe('realm added: demo\n')
    expect(realm.stderr).toBe('')

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
    expect(added.stderr).toBe('')
    const sourceMatch = /^source added: (.+)$/m.exec(added.stdout)
    expect(sourceMatch?.[1]).toBeDefined()
    const sourceId = sourceMatch?.[1] as string

    const synced = await run(['sync', '--source', 'demo-tenders', '--json'])
    expect(synced.exitCode, synced.stderr).toBe(0)
    expect(synced.stderr).toBe('')
    expect(JSON.parse(synced.stdout)).toEqual({
      mode: 'sync',
      results: [
        {
          sourceId,
          status: 'completed',
          run: {
            runId: expect.any(String),
            mode: 'sync',
            status: 'completed',
            added: 8,
            updated: 0,
            deleted: 0,
            warningsCount: 0,
            lastWarning: null,
            errorsCount: 0,
            warnings: [],
          },
        },
      ],
      warnings: [],
    })

    const typedFieldMiss = await run([
      'search',
      'cybersecurity',
      '--kind',
      'ctxindex.demo.tender',
      '--source',
      sourceId,
      '--field',
      'status=awarded',
      '--json',
    ])
    expect(typedFieldMiss.exitCode, typedFieldMiss.stderr).toBe(0)
    expect(typedFieldMiss.stderr).toBe('')
    expect(JSON.parse(typedFieldMiss.stdout)).toEqual({
      results: [],
      warnings: [],
    })

    const searched = await run([
      'search',
      'cybersecurity',
      '--kind',
      'ctxindex.demo.tender',
      '--source',
      sourceId,
      '--field',
      'status=open',
      '--field',
      'category=cybersecurity services',
      '--json',
    ])
    expect(searched.exitCode, searched.stderr).toBe(0)
    expect(searched.stderr).toBe('')
    const ref = `ctx://${sourceId}/tender/DEMO-2026-001`
    expect(JSON.parse(searched.stdout)).toEqual({
      results: [
        {
          ref,
          sourceId,
          profile: { id: 'ctxindex.demo.tender', version: 1 },
          origin: 'local',
          originRank: 0,
          title: 'Cybersecurity incident response retainer',
          summary:
            'Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises.',
          occurredAt: Date.parse('2026-07-06T08:00:00.000Z'),
          chunks: [
            {
              index: 1,
              snippet:
                'Alpine Example Digital Agency <mark>cybersecurity</mark> services',
            },
          ],
        },
      ],
      warnings: [],
    })

    const got = await run(['get', '--json', ref])
    expect(got.exitCode, got.stderr).toBe(0)
    expect(got.stderr).toBe('')
    const getJson = JSON.parse(got.stdout)
    expect(getJson).toMatchObject({
      resource: {
        ref,
        sourceId,
        profile: { id: 'ctxindex.demo.tender', version: 1 },
        origin: 'synced',
        title: 'Cybersecurity incident response retainer',
        deletedAt: null,
        hydratedAt: expect.any(Number),
        payload: {
          reference: 'DEMO-2026-001',
          title: 'Cybersecurity incident response retainer',
          buyer: 'Alpine Example Digital Agency',
          publishedAt: '2026-07-06T08:00:00.000Z',
          deadline: '2026-08-14T10:00:00.000Z',
          status: 'open',
          category: 'cybersecurity services',
          currency: 'EUR',
          estimatedValue: 480000,
          description:
            'Three-year incident response retainer covering 24/7 triage, threat hunting, forensic analysis, and annual tabletop exercises.',
        },
      },
      warnings: [],
    })
    expect(Object.keys(getJson)).toEqual(['resource', 'warnings'])
    expect(Object.keys(getJson.resource).sort()).toEqual(
      [
        'createdAt',
        'deletedAt',
        'hydratedAt',
        'id',
        'occurredAt',
        'origin',
        'payload',
        'profile',
        'providerUpdatedAt',
        'realmId',
        'ref',
        'sourceId',
        'summary',
        'title',
        'updatedAt',
      ].sort(),
    )
    expect(getJson.resource).not.toHaveProperty('tender')
    expect(getJson).not.toHaveProperty('provider')

    const databasePath = join(xdgData, 'ctxindex', 'ctxindex.sqlite')
    const resourceSnapshot = () => {
      const snapshotDb = new Database(databasePath, { readonly: true })
      try {
        return snapshotDb
          .prepare(
            `SELECT id, ref, source_id, realm_id, profile_id, profile_version,
                    title, payload_json, origin, deleted_at
               FROM resources
              ORDER BY id`,
          )
          .all()
      } finally {
        snapshotDb.close()
      }
    }
    const syncedResources = resourceSnapshot()
    expect(syncedResources).toHaveLength(8)

    await writeFile(configPath, configText([]))

    const unavailableSources = await run(['source', 'list', '--json'])
    expect(unavailableSources.exitCode, unavailableSources.stderr).toBe(0)
    expect(JSON.parse(unavailableSources.stdout)[0]).toMatchObject({
      id: sourceId,
      availability: 'extension_unavailable',
      lastStatus: 'idle',
    })
    const unavailableStatus = await run(['status', '--json'])
    expect(unavailableStatus.exitCode, unavailableStatus.stderr).toBe(0)
    expect(JSON.parse(unavailableStatus.stdout)[0]).toMatchObject({
      sourceId,
      availability: 'extension_unavailable',
      lastStatus: 'idle',
    })

    const degradedSearch = await run(['search', '--json', 'cybersecurity'])
    expect(degradedSearch.exitCode, degradedSearch.stderr).toBe(0)
    expect(JSON.parse(degradedSearch.stdout)).toMatchObject({
      results: [{ ref, title: 'Cybersecurity incident response retainer' }],
      warnings: [{ sourceId, code: 'extension_unavailable' }],
    })

    const cachedGet = await run(['get', '--json', ref])
    expect(cachedGet.exitCode, cachedGet.stderr).toBe(0)
    expect(JSON.parse(cachedGet.stdout)).toMatchObject({
      resource: { ref, id: getJson.resource.id, origin: 'synced' },
      warnings: [{ code: 'unknown_profile_version', ref }],
    })
    expect(cachedGet.stderr).toBe('')
    expect(resourceSnapshot()).toEqual(syncedResources)

    const unavailableSync = await run(['sync', '--json', '--source', sourceId])
    expect(unavailableSync.exitCode).toBe(50)
    expect(JSON.parse(unavailableSync.stdout).results[0]).toMatchObject({
      sourceId,
      status: 'failed',
      error: { code: 'adapter_unavailable' },
      exitCode: 50,
    })
    const failedStatus = await run(['status', '--json'])
    expect(JSON.parse(failedStatus.stdout)[0]).toMatchObject({
      sourceId,
      availability: 'extension_unavailable',
      lastStatus: 'failed',
    })
    expect(resourceSnapshot()).toEqual(syncedResources)

    await writeFile(configPath, configText([extensionPath]))

    const restoredSources = await run(['source', 'list', '--json'])
    expect(restoredSources.exitCode, restoredSources.stderr).toBe(0)
    expect(JSON.parse(restoredSources.stdout)[0]).toMatchObject({
      id: sourceId,
      availability: 'available',
      lastStatus: 'failed',
    })
    const restoredStatus = await run(['status', '--json'])
    expect(JSON.parse(restoredStatus.stdout)[0]).toMatchObject({
      sourceId,
      availability: 'available',
      lastStatus: 'failed',
    })
    const restoredSearch = await run([
      'search',
      '--json',
      '--kind',
      'ctxindex.demo.tender',
      'cybersecurity',
    ])
    expect(restoredSearch.exitCode, restoredSearch.stderr).toBe(0)
    expect(JSON.parse(restoredSearch.stdout)).toMatchObject({
      results: [{ ref, title: 'Cybersecurity incident response retainer' }],
      warnings: [],
    })
    expect(resourceSnapshot()).toEqual(syncedResources)

    const db = new Database(databasePath, {
      readonly: true,
    })
    try {
      expect(
        db
          .prepare(
            'SELECT cursor_json FROM source_sync_state WHERE source_id = ?',
          )
          .get(sourceId),
      ).toEqual({
        cursor_json: JSON.stringify({
          version: 1,
          references: [
            'DEMO-2026-001',
            'DEMO-2026-002',
            'DEMO-2026-003',
            'DEMO-2026-004',
            'DEMO-2026-005',
            'DEMO-2026-006',
            'DEMO-2026-007',
            'DEMO-2026-008',
          ],
        }),
      })
      const tables = (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[]
      ).map(({ name }) => name)
      expect(tables.some((name) => /tender|enarocanje/i.test(name))).toBe(false)
    } finally {
      db.close()
    }

    expect(
      await Array.fromAsync(
        new Bun.Glob('**/*tender*').scan(join(repoRoot, 'packages/core')),
      ),
    ).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)
