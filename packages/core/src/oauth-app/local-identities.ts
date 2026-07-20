import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { type CtxindexDatabase, databasePath } from '../storage'

export interface LocalOAuthAppIdentity {
  readonly providerId: string
  readonly label: string
}

interface LocalOAuthAppIdentityRow {
  readonly provider_id: string
  readonly label: string
}

export function listLocalOAuthAppIdentities(
  db: Pick<CtxindexDatabase, 'prepare'>,
): readonly LocalOAuthAppIdentity[] {
  return (
    db
      .prepare(
        'SELECT provider_id, label FROM oauth_apps ORDER BY provider_id, label',
      )
      .all() as readonly LocalOAuthAppIdentityRow[]
  ).map((row) => ({ providerId: row.provider_id, label: row.label }))
}

export function readLocalOAuthAppIdentities(
  path: string = databasePath(),
): readonly LocalOAuthAppIdentity[] {
  if (!existsSync(path)) return []

  const db = new Database(path, { readonly: true, strict: true })
  try {
    const table = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oauth_apps'",
      )
      .get()
    return table ? listLocalOAuthAppIdentities(db) : []
  } finally {
    db.close()
  }
}
