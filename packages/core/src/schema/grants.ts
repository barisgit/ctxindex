import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts'

export const grants = sqliteTable(
  'grants',
  {
    id: text('id').notNull().primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    scopesJson: text('scopes_json').notNull(),
    clientIdRef: text('client_id_ref'),
    clientSecretRef: text('client_secret_ref'),
    accessTokenRef: text('access_token_ref'),
    refreshTokenRef: text('refresh_token_ref'),
    expiresAt: integer('expires_at', { mode: 'number' }),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.accountId)],
)
