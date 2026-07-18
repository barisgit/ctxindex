import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

test('binary CLI syncs local files through generic search, get, and Ref contracts', async () => {
  const sandbox = await createSandbox()
  const requests: URL[] = []
  const egress = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url))
      return Response.json(
        { error: 'provider egress forbidden' },
        { status: 500 },
      )
    },
  })
  const env = {
    NODE_ENV: 'test',
    CTXINDEX_GMAIL_MOCK_BASE_URL: new URL('/', egress.url).toString(),
  }
  try {
    expect((await sandbox.run(['init'], { env })).exitCode).toBe(0)
    expect(
      (await sandbox.run(['realm', 'add', 'work'], { env })).exitCode,
    ).toBe(0)

    const root = join(sandbox.dir, 'files')
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, '.gitignore'), '*.ignored\n')
    await writeFile(
      join(root, 'nested', 'a b%.txt'),
      'generic local file search needle\n',
    )
    await writeFile(join(root, 'hidden.ignored'), 'ignored search needle\n')
    await writeFile(
      join(root, 'binary.png'),
      Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
    await writeFile(join(root, 'oversize.txt'), 'x'.repeat(128))

    const added = await sandbox.run(
      [
        'source',
        'add',
        'local.directory',
        '--realm',
        'work',
        '--config-root-path',
        root,
        '--config-size-cap-bytes',
        '64',
      ],
      { env },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    const sourceId = parseSourceId(added.stdout)

    const first = await sandbox.run(['sync', '--source', sourceId, '--json'], {
      env,
    })
    expect(first.exitCode, first.stderr).toBe(0)
    expect(JSON.parse(first.stdout)).toEqual({
      mode: 'sync',
      results: [
        {
          sourceId,
          status: 'completed',
          run: {
            runId: expect.any(String),
            mode: 'sync',
            status: 'completed',
            added: 1,
            updated: 0,
            deleted: 0,
            warningsCount: 2,
            lastWarning: expect.objectContaining({
              code: 'oversize_skipped',
            }),
            errorsCount: 0,
            warnings: [
              expect.objectContaining({ code: 'binary_skipped' }),
              expect.objectContaining({ code: 'oversize_skipped' }),
            ],
          },
        },
      ],
      warnings: [
        expect.objectContaining({ sourceId, code: 'binary_skipped' }),
        expect.objectContaining({ sourceId, code: 'oversize_skipped' }),
      ],
    })

    const status = await sandbox.run(
      ['status', '--source', sourceId, '--json'],
      {
        env,
      },
    )
    expect(status.exitCode, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toEqual([
      expect.objectContaining({
        sourceId,
        lastStatus: 'idle',
        warningsCount: 2,
        lastWarning: expect.objectContaining({ code: 'oversize_skipped' }),
        errorsCount: 0,
        lastError: null,
      }),
    ])

    const inventory = await sandbox.run(['source', 'list', '--json'], { env })
    expect(inventory.exitCode, inventory.stderr).toBe(0)
    expect(JSON.parse(inventory.stdout)).toEqual([
      expect.objectContaining({
        id: sourceId,
        warningsCount: 2,
        lastWarning: expect.objectContaining({ code: 'oversize_skipped' }),
        errorsCount: 0,
        lastError: null,
      }),
    ])

    const searched = await sandbox.run(
      [
        'search',
        'needle',
        '--kind',
        'file',
        '--source',
        sourceId,
        '--field',
        'path=nested/a b%.txt',
        '--json',
      ],
      { env },
    )
    expect(searched.exitCode, searched.stderr).toBe(0)
    const searchJson = JSON.parse(searched.stdout)
    const ref = `ctx://${sourceId}/file/${encodeURIComponent('nested/a b%.txt')}`
    expect(searchJson).toEqual({
      results: [
        expect.objectContaining({
          ref,
          sourceId,
          profile: { id: 'file', version: 1 },
          origin: 'local',
          chunks: [
            expect.objectContaining({
              snippet: expect.stringContaining('needle'),
            }),
          ],
        }),
      ],
      warnings: [],
    })

    const got = await sandbox.run(['get', '--json', ref], { env })
    expect(got.exitCode, got.stderr).toBe(0)
    const getJson = JSON.parse(got.stdout)
    expect(getJson).toMatchObject({
      resource: {
        ref,
        sourceId,
        profile: { id: 'file', version: 1 },
        origin: 'synced',
        title: 'nested/a b%.txt',
        payload: {
          path: 'nested/a b%.txt',
          text: 'generic local file search needle\n',
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
    expect(getJson.resource).not.toHaveProperty('file')
    expect(getJson.resource).not.toHaveProperty('local')
    expect(getJson.resource).not.toHaveProperty('provider')

    const unchanged = await sandbox.run(
      ['sync', '--source', sourceId, '--json'],
      { env },
    )
    expect(unchanged.exitCode, unchanged.stderr).toBe(0)
    expect(JSON.parse(unchanged.stdout).results[0].run).toMatchObject({
      added: 0,
      updated: 0,
      deleted: 0,
    })

    await rename(
      join(root, 'nested', 'a b%.txt'),
      join(root, 'nested', 'renamed.txt'),
    )
    const diff = await sandbox.run(
      ['sync', '--source', sourceId, '--mode', 'diff', '--json'],
      { env },
    )
    expect(diff.exitCode, diff.stderr).toBe(0)
    expect(JSON.parse(diff.stdout).results[0].run).toMatchObject({
      mode: 'diff',
      added: 1,
      updated: 0,
      deleted: 1,
    })
    expect((await sandbox.run(['get', '--json', ref], { env })).stdout).toBe(
      got.stdout,
    )

    const reconciled = await sandbox.run(
      ['sync', '--source', sourceId, '--json'],
      { env },
    )
    expect(reconciled.exitCode, reconciled.stderr).toBe(0)
    expect(JSON.parse(reconciled.stdout).results[0].run).toMatchObject({
      added: 1,
      updated: 0,
      deleted: 1,
    })
    const old = JSON.parse(
      (await sandbox.run(['get', '--json', ref], { env })).stdout,
    )
    expect(old.resource).toMatchObject({ ref, deletedAt: expect.any(Number) })
    const renamedRef = `ctx://${sourceId}/file/${encodeURIComponent('nested/renamed.txt')}`
    const renamedSearch = JSON.parse(
      (
        await sandbox.run(
          [
            'search',
            'needle',
            '--kind',
            'file',
            '--source',
            sourceId,
            '--json',
          ],
          { env },
        )
      ).stdout,
    )
    expect(
      renamedSearch.results.map((result: { ref: string }) => result.ref),
    ).toEqual([renamedRef])

    const db = new Database(
      join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
      {
        readonly: true,
      },
    )
    try {
      const tables = new Set(
        (
          db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
            .all() as {
            name: string
          }[]
        ).map(({ name }) => name),
      )
      expect(
        [
          'items',
          'item_chunks',
          'external_refs',
          'local_directory_file_state',
          'files',
          'emails',
          'messages',
          'gmail',
        ].filter((name) => tables.has(name)),
      ).toEqual([])
    } finally {
      db.close()
    }
    expect(requests).toEqual([])
  } finally {
    egress.stop(true)
    await sandbox.cleanup()
  }
})
