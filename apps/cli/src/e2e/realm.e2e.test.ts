import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import { createSandbox, type Sandbox } from '@ctxindex/core/testing'

type RealmRow = {
  id: string
  slug: string
  is_default: number
  created_at: number
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

test('realm add and list', async () => {
  const sandbox = await initSandbox()
  try {
    const add = await sandbox.run(['realm', 'add', 'foo'])
    expect(add.exitCode).toBe(0)
    expect(add.stderr).toBe('')
    expect(add.stdout).toContain('realm added: foo')

    const list = await sandbox.run(['realm', 'list', '--json'])
    expect(list.exitCode).toBe(0)
    expect(list.stderr).toBe('')

    const realms = parseRealmList(list.stdout)
    expect(realms.some((realm) => realm.slug === 'global')).toBe(true)
    expect(realms.some((realm) => realm.slug === 'foo')).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})

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

    const realms = parseRealmList(list.stdout)
    expect(Array.isArray(realms)).toBe(true)
    expect(realms.some((realm) => realm.slug === 'global')).toBe(true)
  } finally {
    await sandbox.cleanup()
  }
})
