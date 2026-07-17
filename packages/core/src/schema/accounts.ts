import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').notNull().primaryKey(),
    provider: text('provider').notNull(),
    label: text('label').notNull().unique(),
    externalUserId: text('external_user_id').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.provider, table.externalUserId)],
)
