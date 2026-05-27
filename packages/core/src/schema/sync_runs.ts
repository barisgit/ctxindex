import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sources } from './sources'

export const syncRuns = sqliteTable('sync_runs', {
  id: text('id').notNull().primaryKey(),
  sourceId: text('source_id')
    .notNull()
    .references(() => sources.id),
  mode: text('mode').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  completedAt: integer('completed_at', { mode: 'number' }),
  releasedAt: integer('released_at', { mode: 'number' }),
  cursorBeforeJson: text('cursor_before_json'),
  cursorAfterJson: text('cursor_after_json'),
  itemsSeen: integer('items_seen', { mode: 'number' }).notNull().default(0),
  itemsUpserted: integer('items_upserted', { mode: 'number' })
    .notNull()
    .default(0),
  itemsTombstoned: integer('items_tombstoned', { mode: 'number' })
    .notNull()
    .default(0),
  chunksWritten: integer('chunks_written', { mode: 'number' })
    .notNull()
    .default(0),
  errorsCount: integer('errors_count', { mode: 'number' }).notNull().default(0),
  errorSummary: text('error_summary'),
})
