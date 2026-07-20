import type { CtxindexDatabase } from '../storage'

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
  const table = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oauth_apps'",
    )
    .get()
  if (!table) return []
  return (
    db
      .prepare(
        'SELECT provider_id, label FROM oauth_apps ORDER BY provider_id, label',
      )
      .all() as readonly LocalOAuthAppIdentityRow[]
  ).map((row) => ({ providerId: row.provider_id, label: row.label }))
}
