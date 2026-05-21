import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { items } from './items'

export const mailBodies = sqliteTable('mail_bodies', {
  itemId: text('item_id')
    .notNull()
    .primaryKey()
    .references(() => items.id),
  textBody: text('text_body'),
  htmlBody: text('html_body'),
  bodyHash: text('body_hash'),
})
