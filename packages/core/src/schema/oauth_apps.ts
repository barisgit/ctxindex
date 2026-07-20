import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const oauthApps = sqliteTable(
  'oauth_apps',
  {
    providerId: text('provider_id').notNull(),
    label: text('label').notNull(),
    configRef: text('config_ref').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.providerId, table.label)],
)
