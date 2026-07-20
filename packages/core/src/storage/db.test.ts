import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CtxindexError } from '../errors'
import { applyPragmas, openDatabase, openReadonlyDatabase } from './db'

test('configures the busy timeout before lock-sensitive pragmas', () => {
  const statements: string[] = []
  applyPragmas({
    exec(statement: string) {
      statements.push(statement)
    },
  } as unknown as Database)

  expect(statements[0]).toBe('PRAGMA busy_timeout = 5000;')
  expect(statements).toContain('PRAGMA journal_mode = WAL;')
})

test('opens an existing database read-only without changing its schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ctxindex-readonly-open-'))
  const path = join(directory, 'ctxindex.sqlite')
  const writable = new Database(path, { create: true })
  writable.exec('CREATE TABLE preserved (id INTEGER PRIMARY KEY)')
  writable.close()

  try {
    const readonly = openReadonlyDatabase(path)
    expect(
      readonly
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'preserved' }])
    expect(() => readonly.exec('CREATE TABLE forbidden (id INTEGER)')).toThrow()
    readonly.close()

    const verification = new Database(path, { readonly: true })
    expect(
      verification
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all(),
    ).toEqual([{ name: 'preserved' }])
    verification.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('installs the busy bound before lock-sensitive database setup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ctxindex-pragma-order-'))
  const path = join(directory, 'ctxindex.sqlite')
  const readyPath = join(directory, 'ready')
  const holder = Bun.spawn({
    cmd: [
      process.execPath,
      '-e',
      `import { Database } from 'bun:sqlite';
       import { writeFileSync } from 'node:fs';
       const db = new Database(process.argv[1], { create: true });
       db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE;');
       writeFileSync(process.argv[2], 'ready');
       setTimeout(() => { db.exec('ROLLBACK'); db.close(); }, 200);`,
      path,
      readyPath,
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await Bun.file(readyPath).exists()) break
      await Bun.sleep(10)
    }
    expect(await Bun.file(readyPath).exists()).toBeTrue()

    const contender = new Database(path, { create: true })
    try {
      expect(() => applyPragmas(contender)).not.toThrow()
      const timeout = contender.query('PRAGMA busy_timeout').get() as {
        timeout: number
      }
      expect(timeout.timeout).toBe(5000)
    } finally {
      contender.close()
    }
    expect(await holder.exited).toBe(0)
  } finally {
    holder.kill()
    await rm(directory, { recursive: true, force: true })
  }
})

test('normalizes exhausted lock-sensitive database setup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ctxindex-open-busy-'))
  const path = join(directory, 'ctxindex.sqlite')
  const readyPath = join(directory, 'ready')
  const holder = Bun.spawn({
    cmd: [
      process.execPath,
      '-e',
      `import { Database } from 'bun:sqlite';
       import { writeFileSync } from 'node:fs';
       const db = new Database(process.argv[1], { create: true });
       db.exec('PRAGMA busy_timeout = 5000; BEGIN EXCLUSIVE;');
       writeFileSync(process.argv[2], 'ready');
       setTimeout(() => { db.exec('ROLLBACK'); db.close(); }, 6000);`,
      path,
      readyPath,
    ],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await Bun.file(readyPath).exists()) break
      await Bun.sleep(10)
    }
    expect(await Bun.file(readyPath).exists()).toBeTrue()

    let caught: unknown
    try {
      await openDatabase(path)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CtxindexError)
    expect(caught).toMatchObject({
      code: 'storage_busy',
      cause: expect.any(Error),
    })
    expect((caught as Error).message).toContain('try again')
    expect((caught as Error).message).not.toMatch(/SQLITE|database.*lock|busy/i)
  } finally {
    holder.kill()
    await rm(directory, { recursive: true, force: true })
  }
}, 10_000)
