import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').notNull().primaryKey(),
  provider: text('provider').notNull(),
  label: text('label'),
  externalUserId: text('external_user_id'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
