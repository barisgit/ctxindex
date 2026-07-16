import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'

export const sourceSyncState = sqliteTable('source_sync_state', {
  sourceId: text('source_id')
    .notNull()
    .primaryKey()
    .references(() => sources.id, { onDelete: 'cascade' }),
  lastStatus: text('last_status', {
    enum: ['pending', 'idle', 'needs_auth', 'failed', 'disabled'],
  })
    .notNull()
    .default('pending'),
  lastRunId: text('last_run_id'),
  cursorJson: text('cursor_json'),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})
