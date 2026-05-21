import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const realms = sqliteTable('realms', {
  id: text('id').notNull().primaryKey(),
  slug: text('slug').notNull().unique(),
  label: text('label'),
  isDefault: integer('is_default', { mode: 'boolean' })
    .notNull()
    .default(false),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
