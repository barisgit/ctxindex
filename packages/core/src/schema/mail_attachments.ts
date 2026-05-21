import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { items } from './items'

export const mailAttachments = sqliteTable('mail_attachments', {
  id: text('id').notNull().primaryKey(),
  parentItemId: text('parent_item_id')
    .notNull()
    .references(() => items.id),
  childItemId: text('child_item_id').references(() => items.id),
  filename: text('filename'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes', { mode: 'number' }),
  contentHash: text('content_hash'),
  providerAttachmentId: text('provider_attachment_id'),
  extractionStatus: text('extraction_status')
    .notNull()
    .default('not_extractable'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
