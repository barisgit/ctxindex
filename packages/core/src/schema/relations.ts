import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { resources } from './resources'

export const relations = sqliteTable(
  'relations',
  {
    id: text('id').notNull().primaryKey(),
    sourceResourceId: text('source_resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    relation: text('relation').notNull(),
    targetRef: text('target_ref'),
    targetField: text('target_field'),
    targetValue: text('target_value'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    index('relations_source_idx').on(table.sourceResourceId, table.relation),
    check(
      'relations_target_check',
      sql`(
        ${table.targetRef} IS NOT NULL AND ${table.targetField} IS NULL AND ${table.targetValue} IS NULL
      ) OR (
        ${table.targetRef} IS NULL AND ${table.targetField} IS NOT NULL AND ${table.targetValue} IS NOT NULL
      )`,
    ),
    index('relations_ref_idx')
      .on(table.targetRef)
      .where(sql`${table.targetRef} IS NOT NULL`),
    index('relations_natural_key_idx')
      .on(table.targetField, table.targetValue)
      .where(sql`${table.targetField} IS NOT NULL`),
  ],
)

export const relationResolutions = sqliteTable(
  'relation_resolutions',
  {
    relationId: text('relation_id')
      .notNull()
      .references(() => relations.id, { onDelete: 'cascade' }),
    targetResourceId: text('target_resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    resolvedAt: integer('resolved_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.relationId, table.targetResourceId] }),
    index('relation_resolutions_target_idx').on(
      table.targetResourceId,
      table.relationId,
    ),
  ],
)
