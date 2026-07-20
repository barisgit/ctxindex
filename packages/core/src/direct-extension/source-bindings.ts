import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'
import { databasePath } from '../storage'
import type { DirectExtensionSourceBinding } from './service'

export function readDirectExtensionSourceBindings(
  path: string = databasePath(),
): readonly DirectExtensionSourceBinding[] {
  if (!existsSync(path)) return []
  const db = new Database(path, { readonly: true, strict: true })
  try {
    const table = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sources'",
      )
      .get()
    if (!table) return []
    return (
      db
        .prepare('SELECT id, label, adapter_id FROM sources ORDER BY label, id')
        .all() as readonly {
        readonly id: string
        readonly label: string
        readonly adapter_id: string
      }[]
    ).map((row) => ({
      id: row.id,
      label: row.label,
      adapterId: row.adapter_id,
    }))
  } finally {
    db.close()
  }
}
