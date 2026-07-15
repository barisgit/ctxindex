import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { syncRuns } from './sync_runs'

export const syncRunCheckpoints = sqliteTable('sync_run_checkpoints', {
  id: text('id').notNull().primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => syncRuns.id, { onDelete: 'cascade' }),
  cursorJson: text('cursor_json').notNull(),
  recordedAt: integer('recorded_at', { mode: 'number' }).notNull(),
})
