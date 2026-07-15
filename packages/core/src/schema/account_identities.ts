import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts'

export const accountIdentities = sqliteTable(
  'account_identities',
  {
    id: text('id').notNull().primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [unique().on(table.accountId, table.kind, table.value)],
)
