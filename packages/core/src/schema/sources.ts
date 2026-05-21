import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { accounts } from './accounts'
import { grants } from './grants'
import { realms } from './realms'

export const sources = sqliteTable('sources', {
  id: text('id').notNull().primaryKey(),
  realmId: text('realm_id')
    .notNull()
    .references(() => realms.id),
  adapterId: text('adapter_id').notNull(),
  accountId: text('account_id').references(() => accounts.id),
  grantId: text('grant_id').references(() => grants.id),
  displayName: text('display_name'),
  configJson: text('config_json'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})
