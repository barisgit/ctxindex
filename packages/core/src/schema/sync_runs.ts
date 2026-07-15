import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { realms } from './realms'
import { sources } from './sources'

export const syncRuns = sqliteTable('sync_runs', {
  id: text('id').notNull().primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  realmId: text('realm_id')
    .notNull()
    .references(() => realms.id),
  mode: text('mode').notNull(),
  status: text('status', {
    enum: ['running', 'completed', 'failed', 'cancelled'],
  }).notNull(),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  completedAt: integer('completed_at', { mode: 'number' }),
  cursorBeforeJson: text('cursor_before_json'),
  cursorAfterJson: text('cursor_after_json'),
  resourcesAdded: integer('resources_added', { mode: 'number' })
    .notNull()
    .default(0),
  resourcesUpdated: integer('resources_updated', { mode: 'number' })
    .notNull()
    .default(0),
  resourcesDeleted: integer('resources_deleted', { mode: 'number' })
    .notNull()
    .default(0),
  errorsCount: integer('errors_count', { mode: 'number' }).notNull().default(0),
  errorSummary: text('error_summary'),
})
