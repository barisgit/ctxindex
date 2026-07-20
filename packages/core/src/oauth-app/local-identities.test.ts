import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations } from '../storage'
import {
  listLocalOAuthAppIdentities,
  readLocalOAuthAppIdentities,
} from './local-identities'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function databasePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-oauth-app-identities-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return join(root, 'ctxindex.sqlite')
}

test('read-only OAuth App identity lookup does not create or migrate SQLite', async () => {
  const path = await databasePath()
  expect(readLocalOAuthAppIdentities(path)).toEqual([])
  expect(await Bun.file(path).exists()).toBe(false)
  expect(await Bun.file(`${path}-wal`).exists()).toBe(false)
  expect(await Bun.file(`${path}-shm`).exists()).toBe(false)

  const bare = new Database(path, { create: true })
  bare.exec('CREATE TABLE sentinel (value TEXT)')
  bare.close()
  const before = await readFile(path)

  expect(readLocalOAuthAppIdentities(path)).toEqual([])
  expect(await readFile(path)).toEqual(before)
  expect(await Bun.file(`${path}-wal`).exists()).toBe(false)
  expect(await Bun.file(`${path}-shm`).exists()).toBe(false)
})

test('lists local OAuth App identities deterministically from open and read-only databases', async () => {
  const path = await databasePath()
  const db = new Database(path, { create: true })
  cleanups.push(() => db.close())
  await runMigrations(db)
  const insert = db.prepare(
    'INSERT INTO oauth_apps (provider_id, label, config_ref, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
  )
  insert.run('microsoft', 'work', 'keychain:microsoft/work')
  insert.run('google', 'personal', 'keychain:google/personal')

  const expected = [
    { providerId: 'google', label: 'personal' },
    { providerId: 'microsoft', label: 'work' },
  ]
  expect(listLocalOAuthAppIdentities(db)).toEqual(expected)
  expect(readLocalOAuthAppIdentities(path)).toEqual(expected)
})
