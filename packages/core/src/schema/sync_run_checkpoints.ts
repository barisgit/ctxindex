import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { syncRuns } from './sync_runs'

export const syncRunCheckpoints = sqliteTable('sync_run_checkpoints', {
  id: text('id').notNull().primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => syncRuns.id),
  sequence: integer('sequence', { mode: 'number' }).notNull(),
  checkpointJson: text('checkpoint_json').notNull(),
  countsJson: text('counts_json'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
