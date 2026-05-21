import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { items } from './items'
import { sources } from './sources'

export const externalRefs = sqliteTable(
  'external_refs',
  {
    id: text('id').notNull().primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    externalKind: text('external_kind').notNull(),
    externalId: text('external_id').notNull(),
  },
  (t) => [unique().on(t.sourceId, t.externalKind, t.externalId)],
)
