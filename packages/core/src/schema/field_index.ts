import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'
import { resources } from './resources'

export const fieldIndex = sqliteTable(
  'field_index',
  {
    id: text('id').notNull().primaryKey(),
    resourceId: text('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    declaredType: text('declared_type').notNull(),
    ordinal: integer('ordinal', { mode: 'number' }).notNull(),
    valueText: text('value_text'),
    valueNumber: real('value_number'),
    valueInteger: integer('value_integer', { mode: 'number' }),
  },
  (table) => [
    unique().on(table.resourceId, table.field, table.ordinal),
    check('field_index_ordinal_check', sql`${table.ordinal} >= 0`),
    check(
      'field_index_native_value_check',
      sql`(
        ${table.declaredType} IN ('string', 'string[]') AND ${table.valueText} IS NOT NULL AND ${table.valueNumber} IS NULL AND ${table.valueInteger} IS NULL
      ) OR (
        ${table.declaredType} IN ('number', 'number[]') AND ${table.valueText} IS NULL AND ${table.valueNumber} IS NOT NULL AND ${table.valueInteger} IS NULL
      ) OR (
        ${table.declaredType} IN ('boolean', 'boolean[]', 'datetime', 'datetime[]') AND ${table.valueText} IS NULL AND ${table.valueNumber} IS NULL AND ${table.valueInteger} IS NOT NULL
      )`,
    ),
    check(
      'field_index_boolean_check',
      sql`${table.declaredType} NOT IN ('boolean', 'boolean[]') OR ${table.valueInteger} IN (0, 1)`,
    ),
    index('field_index_text_idx')
      .on(table.field, table.valueText)
      .where(sql`${table.valueText} IS NOT NULL`),
    index('field_index_number_idx')
      .on(table.field, table.valueNumber)
      .where(sql`${table.valueNumber} IS NOT NULL`),
    index('field_index_integer_idx')
      .on(table.field, table.valueInteger)
      .where(sql`${table.valueInteger} IS NOT NULL`),
  ],
)
