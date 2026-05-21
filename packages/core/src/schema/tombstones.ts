import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { items } from './items'
import { sources } from './sources'

export const tombstones = sqliteTable('tombstones', {
  id: text('id').notNull().primaryKey(),
  itemId: text('item_id')
    .notNull()
    .references(() => items.id),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  tombstonedAt: integer('tombstoned_at', { mode: 'number' }).notNull(),
  reason: text('reason'),
})
