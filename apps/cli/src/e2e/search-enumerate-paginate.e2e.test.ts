import { expect, test } from 'bun:test'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

function parseSourceId(stdout: string): string {
  const match = /^source added: (.+)$/m.exec(stdout)
  if (!match?.[1]) throw new Error(`Could not parse source id from: ${stdout}`)
  return match[1]
}

test('binary CLI enumerates filter-only searches locally and paginates deterministically', async () => {
  const sandbox = await createSandbox()
  const env = { NODE_ENV: 'test' }
  try {
    expect((await sandbox.run(['init'], { env })).exitCode).toBe(0)
    expect(
      (await sandbox.run(['realm', 'add', 'work'], { env })).exitCode,
    ).toBe(0)

    const root = join(sandbox.dir, 'files')
    await mkdir(root, { recursive: true })
    for (const name of ['a.txt', 'b.txt', 'c.txt']) {
      await writeFile(join(root, name), `content of ${name}\n`)
    }
    const added = await sandbox.run(
      [
        'source',
        'add',
        'local.directory',
        '--realm',
        'work',
        '--config-root-path',
        root,
      ],
      { env },
    )
    expect(added.exitCode, added.stderr).toBe(0)
    const sourceId = parseSourceId(added.stdout)
    const synced = await sandbox.run(['sync', '--source', sourceId], { env })
    expect(synced.exitCode, synced.stderr).toBe(0)

    const refOf = (name: string) => `ctx://${sourceId}/file/${name}`

    const enumerate = await sandbox.run(
      ['search', '--kind', 'file', '--source', sourceId, '--json'],
      { env },
    )
    expect(enumerate.exitCode, enumerate.stderr).toBe(0)
    const enumerated = JSON.parse(enumerate.stdout)
    expect(Object.keys(enumerated)).toEqual([
      'results',
      'pagination',
      'warnings',
    ])
    expect(enumerated.pagination).toEqual({
      offset: 0,
      limit: 20,
      hasMore: false,
    })
    const allRefs = enumerated.results.map(
      (result: { ref: string }) => result.ref,
    )
    expect([...allRefs].sort()).toEqual([
      refOf('a.txt'),
      refOf('b.txt'),
      refOf('c.txt'),
    ])

    const rerun = await sandbox.run(
      ['search', '--kind', 'file', '--source', sourceId, '--json'],
      { env },
    )
    expect(rerun.stdout).toBe(enumerate.stdout)

    const pageOne = JSON.parse(
      (
        await sandbox.run(
          [
            'search',
            '--kind',
            'file',
            '--source',
            sourceId,
            '--limit',
            '2',
            '--json',
          ],
          { env },
        )
      ).stdout,
    )
    const pageTwo = JSON.parse(
      (
        await sandbox.run(
          [
            'search',
            '--kind',
            'file',
            '--source',
            sourceId,
            '--limit',
            '2',
            '--offset',
            '2',
            '--json',
          ],
          { env },
        )
      ).stdout,
    )
    expect(pageOne.pagination).toEqual({ offset: 0, limit: 2, hasMore: true })
    expect(pageTwo.pagination).toEqual({ offset: 2, limit: 2, hasMore: false })
    expect([
      ...pageOne.results.map((result: { ref: string }) => result.ref),
      ...pageTwo.results.map((result: { ref: string }) => result.ref),
    ]).toEqual(allRefs)

    await rename(join(root, 'a.txt'), join(root, 'renamed-a.txt'))
    const resynced = await sandbox.run(
      ['sync', '--source', sourceId, '--json'],
      { env },
    )
    expect(resynced.exitCode, resynced.stderr).toBe(0)
    const withDeleted = await sandbox.run(
      ['search', '--include-deleted', '--json'],
      { env },
    )
    expect(withDeleted.exitCode, withDeleted.stderr).toBe(0)
    const includedResults = JSON.parse(withDeleted.stdout).results as Array<{
      ref: string
      deletedAt?: number
    }>
    expect(includedResults.map((result) => result.ref).sort()).toEqual(
      ['a.txt', 'b.txt', 'c.txt', 'renamed-a.txt'].map(refOf).sort(),
    )
    expect(
      includedResults.find((result) => result.ref === refOf('a.txt')),
    ).toEqual(
      expect.objectContaining({
        deletedAt: expect.any(Number),
      }),
    )
    expect(
      includedResults
        .filter((result) => result.ref !== refOf('a.txt'))
        .every((result) => !('deletedAt' in result)),
    ).toBe(true)

    const bare = await sandbox.run(['search'], { env })
    expect(bare.exitCode).toBe(2)
    expect(bare.stderr).toContain('at least one filter')

    const remote = await sandbox.run(['search', '--kind', 'file', '--remote'], {
      env,
    })
    expect(remote.exitCode).toBe(0)
    expect(remote.stderr).toContain('does not support remote search')

    const badOffset = await sandbox.run(
      ['search', 'content', '--kind', 'file', '--offset', '2'],
      { env },
    )
    expect(badOffset.exitCode).toBe(2)
    expect(badOffset.stderr).toContain('--offset requires local execution')
  } finally {
    await sandbox.cleanup()
  }
})
