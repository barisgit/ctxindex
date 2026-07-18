import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { exists, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

function syncState(sandbox: Sandbox): {
  readonly runs: number
  readonly states: number
  readonly resources: number
} {
  const db = new Database(
    join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite'),
    { readonly: true },
  )
  try {
    return db
      .prepare<
        {
          readonly runs: number
          readonly states: number
          readonly resources: number
        },
        []
      >(`
        SELECT
          (SELECT COUNT(*) FROM sync_runs) AS runs,
          (SELECT COUNT(*) FROM source_sync_state) AS states,
          (SELECT COUNT(*) FROM resources) AS resources
      `)
      .get() as { runs: number; states: number; resources: number }
  } finally {
    db.close()
  }
}

test('malformed sync arguments fail before initialization', async () => {
  const sandbox = await createSandbox()
  try {
    const malformed = [
      ['sync', '--unknown'],
      ['--wat', 'sync'],
      ['--json=false', 'sync'],
      ['--mode=wat', 'sync'],
    ]
    const results = []
    for (const args of malformed) results.push(await sandbox.run(args))

    expect(
      await exists(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)
    for (const result of results) {
      expect(result.exitCode, result.stderr).toBe(2)
    }
    expect(results[0]?.stderr).toContain('sync: unknown flag --unknown')
    expect(results[1]?.stderr).toContain(
      'sync: option must follow command: --wat',
    )
    expect(results[2]?.stderr).toContain(
      'sync: option must follow command: --json',
    )
    expect(results[3]?.stderr).toContain(
      'sync: option must follow command: --mode',
    )
  } finally {
    await sandbox.cleanup()
  }
})

test('sync help preserves valid root option placement without initialization', async () => {
  const sandbox = await createSandbox()
  try {
    const helpBeforeCommand = await sandbox.run(['--help', 'sync'])
    const globalLogLevel = await sandbox.run([
      '--log-level',
      'error',
      'sync',
      '--help',
    ])

    expect(helpBeforeCommand.exitCode, helpBeforeCommand.stderr).toBe(0)
    expect(helpBeforeCommand.stdout).toContain(
      'Run a sync for one or all sources',
    )
    expect(globalLogLevel.exitCode, globalLogLevel.stderr).toBe(0)
    expect(globalLogLevel.stdout).toContain('Run a sync for one or all sources')
    expect(
      await exists(join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')),
    ).toBe(false)
  } finally {
    await sandbox.cleanup()
  }
})

test('malformed sync arguments leave configured sync state unchanged', async () => {
  const sandbox = await createSandbox()
  try {
    expect((await sandbox.run(['init'])).exitCode).toBe(0)
    expect((await sandbox.run(['realm', 'add', 'work'])).exitCode).toBe(0)
    const root = join(sandbox.dir, 'notes')
    await mkdir(root)
    await writeFile(join(root, 'note.txt'), 'must remain unsynced')
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
    const before = syncState(sandbox)

    const malformed = [
      ['sync', '--source', 'notes', '--unknown'],
      ['--wat', 'sync', '--source', 'notes'],
      ['--json=false', 'sync', '--source', 'notes'],
      ['--mode=wat', 'sync', '--source', 'notes'],
      ['sync', 'unexpected', '--source', 'notes'],
      ['sync', '--source', 'notes', '--source', 'notes'],
      ['sync', '--source', 'notes', '--json', '--json'],
      ['sync', '--source', 'notes', '--json=false'],
      ['sync', '--source='],
      ['sync', '--source', 'notes', '--mode'],
      ['sync', '--source', 'notes', '--mode', 'wat'],
    ]
    const results = []
    for (const args of malformed) results.push(await sandbox.run(args))

    expect(syncState(sandbox)).toEqual(before)
    for (const result of results) {
      expect(result.exitCode, result.stderr).toBe(2)
    }
    expect(results.at(-2)?.stderr).toContain(
      'sync: --mode requires a non-empty value',
    )
    expect(results.at(-1)?.stderr).toContain(
      'sync: --mode must be sync, resync, or diff',
    )
  } finally {
    await sandbox.cleanup()
  }
}, 15_000)
