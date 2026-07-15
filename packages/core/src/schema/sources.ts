import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { grants } from './grants'
import { realms } from './realms'

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').notNull().primaryKey(),
    realmId: text('realm_id')
      .notNull()
      .references(() => realms.id),
    adapterId: text('adapter_id').notNull(),
    adapterVersion: integer('adapter_version', { mode: 'number' }).notNull(),
    grantId: text('grant_id').references(() => grants.id),
    displayName: text('display_name'),
    configJson: text('config_json').notNull(),
    syncEnabled: integer('sync_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    searchRouting: text('search_routing', {
      enum: ['indexed', 'federated', 'hybrid'],
    }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'sources_search_routing_check',
      sql`${table.searchRouting} IS NULL OR ${table.searchRouting} IN ('indexed', 'federated', 'hybrid')`,
    ),
  ],
)
