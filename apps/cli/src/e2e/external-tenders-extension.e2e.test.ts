import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../../../..')
const extensionPath = join(repoRoot, 'examples/tenders-extension/extension.ts')

test('relocated compiled CLI syncs external tenders through generic verbs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-tenders-e2e-'))
  const buildOutput = join(root, 'build', 'ctxindex')
  const relocatedBinary = join(root, 'relocated', 'ctxindex')
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

    await mkdir(join(root, 'relocated'), { recursive: true })
    await copyFile(buildOutput, relocatedBinary)
    expect(relocatedBinary).not.toBe(buildOutput)
    expect(extensionPath.startsWith(join(repoRoot, 'examples'))).toBe(true)
    expect(extensionPath.startsWith(join(repoRoot, 'packages'))).toBe(false)
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

    const realm = await run(['realm', 'add', 'procurement'])
    expect(realm.exitCode, realm.stderr).toBe(0)
    expect(realm.stdout).toBe('realm added: procurement\n')
    expect(realm.stderr).toBe('')

    const added = await run([
      'source',
      'add',
      'enarocanje.fixture',
      '--realm',
      'procurement',
    ])
    expect(added.exitCode, added.stderr).toBe(0)
    expect(added.stderr).toBe('')
    const sourceMatch = /^source added: (.+)$/m.exec(added.stdout)
    expect(sourceMatch?.[1]).toBeDefined()
    const sourceId = sourceMatch?.[1] as string

    const synced = await run(['sync', '--source', sourceId, '--json'])
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
            added: 2,
            updated: 0,
            deleted: 0,
            errorsCount: 0,
            warnings: [],
          },
        },
      ],
      warnings: [],
    })

    const typedFieldMiss = await run([
      'search',
      'equipment',
      '--kind',
      'tenders',
      '--source',
      sourceId,
      '--field',
      'reference=JN-002/2026',
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
      'equipment',
      '--kind',
      'tenders',
      '--source',
      sourceId,
      '--field',
      'reference=JN-001/2026',
      '--json',
    ])
    expect(searched.exitCode, searched.stderr).toBe(0)
    expect(searched.stderr).toBe('')
    const ref = `ctx://${sourceId}/tender/${encodeURIComponent('JN-001/2026')}`
    expect(JSON.parse(searched.stdout)).toEqual({
      results: [
        {
          ref,
          sourceId,
          profile: { id: 'enarocanje.tender', version: 1 },
          origin: 'local',
          originRank: 0,
          title: 'Supply of laboratory equipment',
          summary: 'Supply and installation of laboratory analysis equipment.',
          occurredAt: Date.parse('2026-01-15T09:00:00.000Z'),
          chunks: [
            {
              index: 0,
              snippet:
                'Supply and installation of laboratory analysis <mark>equipment</mark>.',
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
        profile: { id: 'enarocanje.tender', version: 1 },
        origin: 'synced',
        title: 'Supply of laboratory equipment',
        deletedAt: null,
        hydratedAt: expect.any(Number),
        payload: {
          reference: 'JN-001/2026',
          title: 'Supply of laboratory equipment',
          buyer: 'National Research Institute',
          publishedAt: '2026-01-15T09:00:00.000Z',
          deadline: '2026-02-12T11:00:00.000Z',
          status: 'open',
          description:
            'Supply and installation of laboratory analysis equipment.',
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
    expect(syncedResources).toHaveLength(2)

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

    const degradedSearch = await run(['search', '--json', 'equipment'])
    expect(degradedSearch.exitCode, degradedSearch.stderr).toBe(0)
    expect(JSON.parse(degradedSearch.stdout)).toMatchObject({
      results: [{ ref, title: 'Supply of laboratory equipment' }],
      warnings: [{ sourceId, code: 'extension_unavailable' }],
    })

    const cachedGet = await run(['get', '--json', ref])
    expect(cachedGet.exitCode, cachedGet.stderr).toBe(0)
    expect(JSON.parse(cachedGet.stdout)).toMatchObject({
      resource: { ref, id: getJson.resource.id, origin: 'synced' },
      warnings: [{ code: 'unknown_profile_version', ref }],
    })
    expect(cachedGet.stderr).toContain('unknown_profile_version')
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
      'tenders',
      'equipment',
    ])
    expect(restoredSearch.exitCode, restoredSearch.stderr).toBe(0)
    expect(JSON.parse(restoredSearch.stdout)).toMatchObject({
      results: [{ ref, title: 'Supply of laboratory equipment' }],
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
          references: ['JN-001/2026', 'JN-002/2026'],
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
