import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations } from '../storage'
import { listLocalOAuthAppIdentities } from './local-identities'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function databasePath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'ctxindex-oauth-app-identities-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return join(root, 'ctxindex.sqlite')
}

test('lists local OAuth App identities deterministically from an open database', async () => {
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
})

test('returns an empty inventory when an open partial database has no OAuth App table', async () => {
  const path = await databasePath()
  const db = new Database(path, { create: true })
  cleanups.push(() => db.close())
  db.exec('CREATE TABLE preserved (id INTEGER PRIMARY KEY)')

  expect(listLocalOAuthAppIdentities(db)).toEqual([])
})
