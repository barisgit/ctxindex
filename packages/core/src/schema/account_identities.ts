import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts'

export const accountIdentities = sqliteTable('account_identities', {
  id: text('id').notNull().primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  sourceId: text('source_id'),
  addressOrIdentifier: text('address_or_identifier').notNull(),
  identityKind: text('identity_kind').notNull(),
  confirmedAt: integer('confirmed_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
