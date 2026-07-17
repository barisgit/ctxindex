import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    provider: text('provider').notNull(),
    label: text('label').notNull(),
    clientIdRef: text('client_id_ref').notNull(),
    clientSecretRef: text('client_secret_ref'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.provider, table.label)],
)
