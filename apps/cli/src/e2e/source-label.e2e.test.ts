import { expect, test } from 'bun:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox } from '@ctxindex/core/testing'

test('Source labels work everywhere Source ids are accepted', async () => {
  const sandbox = await createSandbox()
  try {
    const root = join(sandbox.dir, 'notes')
    await mkdir(root)
    await writeFile(join(root, 'hello.txt'), 'label routed search text')
    expect((await sandbox.run(['init'])).exitCode).toBe(0)
    expect((await sandbox.run(['realm', 'add', 'work'])).exitCode).toBe(0)
    const added = await sandbox.run([
      'source',
      'add',
      'local.directory',
      '--realm',
      'work',
      '--label',
      'notes',
      '--config-root-path',
      root,
    ])
    expect(added.exitCode, added.stderr).toBe(0)

    const collision = await sandbox.run([
      'source',
      'add',
      'local.directory',
      '--realm',
      'work',
      '--label',
      'notes',
      '--config-root-path',
      root,
    ])
    expect(collision.exitCode).toBe(2)
    expect(collision.stderr).toContain('Source label "notes" is already taken')

    const synced = await sandbox.run(['sync', '--source', 'notes', '--json'])
    expect(synced.exitCode, synced.stderr).toBe(0)
    expect(JSON.parse(synced.stdout).results).toHaveLength(1)

    const status = await sandbox.run(['status', '--source', 'notes', '--json'])
    expect(status.exitCode, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toHaveLength(1)

    const searched = await sandbox.run([
      'search',
      'label routed',
      '--source',
      'notes',
      '--json',
    ])
    expect(searched.exitCode, searched.stderr).toBe(0)
    expect(JSON.parse(searched.stdout).results).toHaveLength(1)

    const removed = await sandbox.run(['source', 'remove', 'notes'])
    expect(removed.exitCode, removed.stderr).toBe(0)
  } finally {
    await sandbox.cleanup()
  }
})
