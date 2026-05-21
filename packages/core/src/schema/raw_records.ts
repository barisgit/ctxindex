import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'

export const rawRecords = sqliteTable('raw_records', {
  id: text('id').notNull().primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  adapterId: text('adapter_id').notNull(),
  externalKind: text('external_kind').notNull(),
  externalId: text('external_id').notNull(),
  payloadJson: text('payload_json').notNull(),
  capturedAt: integer('captured_at', { mode: 'number' }).notNull(),
})
