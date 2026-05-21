import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { items } from './items'
import { sources } from './sources'

export const itemChunks = sqliteTable(
  'item_chunks',
  {
    id: text('id').notNull().primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    chunkIndex: integer('chunk_index', { mode: 'number' }).notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (t) => [unique().on(t.itemId, t.chunkIndex)],
)
