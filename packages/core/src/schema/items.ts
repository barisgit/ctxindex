import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'

export const items = sqliteTable('items', {
  id: text('id').notNull().primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  kind: text('kind').notNull(),
  title: text('title'),
  summary: text('summary'),
  occurredAt: integer('occurred_at', { mode: 'number' }),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
