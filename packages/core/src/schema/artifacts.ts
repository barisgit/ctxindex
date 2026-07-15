import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { resources } from './resources'

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: text('id').notNull().primaryKey(),
    ref: text('ref').notNull().unique(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    originRef: text('origin_ref').notNull(),
    contentHash: text('content_hash').notNull(),
    mediaType: text('media_type').notNull(),
    byteSize: integer('byte_size', { mode: 'number' }).notNull(),
    retentionClass: text('retention_class').notNull(),
    localPath: text('local_path').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'artifacts_retention_class_check',
      sql`${table.retentionClass} = 'cached'`,
    ),
    index('artifacts_content_hash_idx').on(table.contentHash),
  ],
)
