import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'
import { syncRuns } from './sync_runs'

export const sourceSyncState = sqliteTable('source_sync_state', {
  sourceId: text('source_id')
    .notNull()
    .primaryKey()
    .references(() => sources.id),
  currentCursorJson: text('current_cursor_json'),
  lastSuccessfulRunId: text('last_successful_run_id').references(
    () => syncRuns.id,
  ),
  lastStatus: text('last_status').notNull().default('idle'),
  lastStartedAt: integer('last_started_at', { mode: 'number' }),
  lastCompletedAt: integer('last_completed_at', { mode: 'number' }),
})
