import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
import { realms } from './realms'
import { sources } from './sources'

export const resources = sqliteTable(
  'resources',
  {
    id: text('id').notNull().primaryKey(),
    ref: text('ref').notNull().unique(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    realmId: text('realm_id')
      .notNull()
      .references(() => realms.id),
    profileId: text('profile_id').notNull(),
    profileVersion: integer('profile_version', { mode: 'number' }).notNull(),
    title: text('title'),
    summary: text('summary'),
    occurredAt: integer('occurred_at', { mode: 'number' }),
    providerUpdatedAt: integer('provider_updated_at', { mode: 'number' }),
    deletedAt: integer('deleted_at', { mode: 'number' }),
    hydratedAt: integer('hydrated_at', { mode: 'number' }),
    origin: text('origin', { enum: ['synced', 'adhoc'] }).notNull(),
    payloadJson: text('payload_json'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    unique().on(table.sourceId, table.ref),
    index('resources_source_idx').on(table.sourceId),
    index('resources_realm_idx').on(table.realmId),
    index('resources_profile_idx').on(table.profileId, table.profileVersion),
    index('resources_occurred_idx').on(table.occurredAt),
  ],
)
