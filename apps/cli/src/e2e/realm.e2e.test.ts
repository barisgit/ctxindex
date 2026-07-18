import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

type RealmRow = {
  id: string
  slug: string
  label: string | null
  createdAt: number
}

function dbPath(sandbox: Sandbox): string {
  return join(sandbox.env.CTXINDEX_DATA_HOME, 'ctxindex.sqlite')
}

function realmCount(sandbox: Sandbox, slug: string): number {
  const db = new Database(dbPath(sandbox), { readonly: true })
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS count FROM realms WHERE slug = ?')
      .get(slug) as { count: number }
    return row.count
  } finally {
    db.close()
  }
}

async function initSandbox(): Promise<Sandbox> {
  const sandbox = await createSandbox()
  const init = await sandbox.run(['init'])
  expect(init.exitCode).toBe(0)
  expect(init.stderr).toBe('')
  return sandbox
}

function parseRealmList(stdout: string): RealmRow[] {
  return JSON.parse(stdout) as RealmRow[]
}

test('realm add persists optional display names without changing text output', async () => {
  const sandbox = await initSandbox()
  try {
    const named = await sandbox.run([
      'realm',
      'add',
      'personal',
      '--name',
      'Personal',
    ])
    expect(named.exitCode).toBe(0)
    expect(named.stderr).toBe('')
    expect(named.stdout).toBe('realm added: personal\n')

    const shortHelpNamed = await sandbox.run([
      'realm',
      'add',
      'short-help',
      '--name',
      '-h',
    ])
    expect(shortHelpNamed.exitCode).toBe(0)
    expect(shortHelpNamed.stderr).toBe('')
    expect(shortHelpNamed.stdout).toBe('realm added: short-help\n')

    const unnamed = await sandbox.run(['realm', 'add', 'work'])
    expect(unnamed.exitCode).toBe(0)
    expect(unnamed.stderr).toBe('')
    expect(unnamed.stdout).toBe('realm added: work\n')

    const list = await sandbox.run(['realm', 'list', '--json'])
    expect(list.exitCode).toBe(0)
    expect(list.stderr).toBe('')

    expect(parseRealmList(list.stdout)).toEqual([
      {
        id: 'personal',
        slug: 'personal',
        label: 'Personal',
        createdAt: expect.any(Number),
      },
      {
        id: 'short-help',
        slug: 'short-help',
        label: '-h',
        createdAt: expect.any(Number),
      },
      {
        id: 'work',
        slug: 'work',
        label: null,
        createdAt: expect.any(Number),
      },
    ])
  } finally {
    await sandbox.cleanup()
  }
})

test('invalid realm add input exits 2 without writing', async () => {
  const sandbox = await initSandbox()
  try {
    for (const args of [
      ['realm', 'add'],
      ['realm', 'add', 'personal', '--name'],
      ['realm', 'add', 'personal', '--name', 'Personal', '--name', 'Other'],
      ['realm', 'add', 'personal', 'extra'],
      ['realm', 'add', 'personal', '--unknown'],
      ['realm', 'list', '--unknown'],
    ]) {
      const result = await sandbox.run(args)
      expect(result.exitCode).toBe(2)
      expect(result.stderr.length).toBeGreaterThan(0)
    }

    const list = await sandbox.run(['realm', 'list', '--json'])
    expect(list.exitCode, list.stderr).toBe(0)
    expect(parseRealmList(list.stdout)).toEqual([])
  } finally {
    await sandbox.cleanup()
  }
}, 15_000)

test('realm row present', async () => {
  const sandbox = await initSandbox()
  try {
    const add = await sandbox.run(['realm', 'add', 'foo'])
    expect(add.exitCode).toBe(0)
    expect(realmCount(sandbox, 'foo')).toBe(1)
  } finally {
    await sandbox.cleanup()
  }
})

test('duplicate realm rejected', async () => {
  const sandbox = await initSandbox()
  try {
    const first = await sandbox.run(['realm', 'add', 'foo'])
    const second = await sandbox.run(['realm', 'add', 'foo'])

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).not.toBe(0)
    expect(second.stderr).toContain('realm already exists')
    expect(realmCount(sandbox, 'foo')).toBe(1)
  } finally {
    await sandbox.cleanup()
  }
})

test('invalid realm name exits 2', async () => {
  const sandbox = await initSandbox()
  try {
    const result = await sandbox.run(['realm', 'add', 'bad name!'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr.length).toBeGreaterThan(0)
    expect(realmCount(sandbox, 'bad name!')).toBe(0)
  } finally {
    await sandbox.cleanup()
  }
})

test('list json parses', async () => {
  const sandbox = await initSandbox()
  try {
    const list = await sandbox.run(['realm', 'list', '--json'])

    expect(list.exitCode).toBe(0)
    expect(list.stderr).toBe('')

    expect(parseRealmList(list.stdout)).toEqual([])
  } finally {
    await sandbox.cleanup()
  }
})
