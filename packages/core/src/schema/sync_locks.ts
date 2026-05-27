import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { syncRuns } from './sync_runs'

export const syncLocks = sqliteTable('sync_locks', {
  scope: text('scope').notNull().primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => syncRuns.id),
  pid: integer('pid', { mode: 'number' }),
  acquiredAt: integer('acquired_at', { mode: 'number' }).notNull(),
  releasedAt: integer('released_at', { mode: 'number' }),
})
