import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
import { applyPragmas } from './db'
import { runMigrations } from './migrator'

const dbs: Database[] = []

function freshDb(): Database {
  const db = new Database(':memory:', { create: true })
  applyPragmas(db)
  dbs.push(db)
  return db
}

afterEach(() => {
  for (const db of dbs.splice(0)) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
})

test('legacy grant rows tolerate nullable credential refs', async () => {
  const db = freshDb()
  await runMigrations(db)

  db.prepare(
    `INSERT INTO accounts (id, realm_id, provider, display_name, email, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('account-1', 'global', 'google', 'Test Account', 'test@example.com', 0)

  db.prepare(
    `INSERT INTO grants (
      id,
      account_id,
      provider,
      scopes,
      client_id_ref,
      client_secret_ref,
      access_token_ref,
      refresh_token_ref,
      expires_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'grant-legacy',
    'account-1',
    'google',
    '[]',
    null,
    null,
    'secret://access-legacy',
    'secret://refresh-legacy',
    null,
    0,
    0,
  )

  db.prepare(
    `INSERT INTO grants (
      id,
      account_id,
      provider,
      scopes,
      client_id_ref,
      client_secret_ref,
      access_token_ref,
      refresh_token_ref,
      expires_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'grant-creds',
    'account-1',
    'google',
    '[]',
    'secret://client-id',
    'secret://client-secret',
    'secret://access-creds',
    'secret://refresh-creds',
    null,
    0,
    0,
  )

  const rows = db
    .prepare(
      `SELECT id, client_id_ref, client_secret_ref
        FROM grants
        ORDER BY id`,
    )
    .all() as {
    id: string
    client_id_ref: string | null
    client_secret_ref: string | null
  }[]

  expect(rows).toEqual([
    {
      id: 'grant-creds',
      client_id_ref: 'secret://client-id',
      client_secret_ref: 'secret://client-secret',
    },
    {
      id: 'grant-legacy',
      client_id_ref: null,
      client_secret_ref: null,
    },
  ])
})
