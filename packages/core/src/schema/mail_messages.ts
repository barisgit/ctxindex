import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { items } from './items'
import { sources } from './sources'

export const mailMessages = sqliteTable('mail_messages', {
  itemId: text('item_id')
    .notNull()
    .primaryKey()
    .references(() => items.id),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  internetMessageId: text('internet_message_id'),
  providerThreadId: text('provider_thread_id'),
  subject: text('subject'),
  fromJson: text('from_json'),
  toJson: text('to_json'),
  ccJson: text('cc_json'),
  bccJson: text('bcc_json'),
  sentAt: integer('sent_at', { mode: 'number' }),
  receivedAt: integer('received_at', { mode: 'number' }),
  direction: text('direction').notNull().default('unknown'),
  hasAttachments: integer('has_attachments', { mode: 'boolean' })
    .notNull()
    .default(false),
  attachmentCount: integer('attachment_count', { mode: 'number' })
    .notNull()
    .default(0),
})
