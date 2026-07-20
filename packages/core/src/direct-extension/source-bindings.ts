import type { CtxindexDatabase } from '../storage'
import type { DirectExtensionSourceBinding } from './service'

export function readDirectExtensionSourceBindings(
  db: CtxindexDatabase,
): readonly DirectExtensionSourceBinding[] {
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
}
