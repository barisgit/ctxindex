import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { items } from './items'
import { sources } from './sources'

export const itemRelations = sqliteTable('item_relations', {
  id: text('id').notNull().primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  fromItemId: text('from_item_id')
    .notNull()
    .references(() => items.id),
  toItemId: text('to_item_id')
    .notNull()
    .references(() => items.id),
  relationType: text('relation_type').notNull(),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
