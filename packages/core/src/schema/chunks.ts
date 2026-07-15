import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { resources } from './resources'

export const chunks = sqliteTable(
  'chunks',
  {
    id: text('id').notNull().primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index', { mode: 'number' }).notNull(),
    content: text('content').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.resourceId, table.chunkIndex)],
)
