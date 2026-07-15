import type { ProfileRelationTarget } from '@ctxindex/extension-sdk'
import { newId } from '../ids'
import { parseRef } from '../ref/ref'
import type { CtxindexDatabase } from '../storage/db'

export type RelationTarget = ProfileRelationTarget

export interface RelationWrite {
  readonly relation: string
  readonly target: RelationTarget
}

export interface StoredRelation extends RelationWrite {
  readonly id: string
  readonly sourceResourceId: string
  readonly resolvedResourceIds: readonly string[]
}

export interface TraversalResult {
  readonly resourceId: string
  readonly direction: 'outgoing' | 'incoming'
}

type RelationRow = {
  id: string
  source_resource_id: string
  relation: string
  target_ref: string | null
  target_field: string | null
  target_value: string | null
}

export class RelationStore {
  constructor(private readonly db: CtxindexDatabase) {}

  replace(sourceResourceId: string, relations: readonly RelationWrite[]): void {
    this.db.transaction(() => {
      const source = this.db
        .prepare('SELECT id FROM resources WHERE id = ?')
        .get(sourceResourceId)
      if (!source) throw new Error(`Unknown Resource "${sourceResourceId}"`)
      this.db
        .prepare('DELETE FROM relations WHERE source_resource_id = ?')
        .run(sourceResourceId)
      const insert = this.db.prepare(`
        INSERT INTO relations (
          id, source_resource_id, relation, target_ref, target_field,
          target_value, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      for (const edge of relations) {
        if (edge.relation.length === 0)
          throw new TypeError('Relation name must not be empty')
        if ('ref' in edge.target) {
          parseRef(edge.target.ref)
          insert.run(
            newId(),
            sourceResourceId,
            edge.relation,
            edge.target.ref,
            null,
            null,
            Date.now(),
          )
        } else {
          if (
            edge.target.field.length === 0 ||
            edge.target.value.length === 0
          ) {
            throw new TypeError('Relation natural key must not be empty')
          }
          insert.run(
            newId(),
            sourceResourceId,
            edge.relation,
            null,
            edge.target.field,
            edge.target.value,
            Date.now(),
          )
        }
      }
    })()
  }

  list(sourceResourceId: string): readonly StoredRelation[] {
    const rows = this.db
      .prepare(`
        SELECT id, source_resource_id, relation, target_ref, target_field, target_value
        FROM relations
        WHERE source_resource_id = ?
        ORDER BY rowid
      `)
      .all(sourceResourceId) as RelationRow[]
    return rows.map((row) => {
      this.resolve(row)
      const resolvedResourceIds = (
        this.db
          .prepare(
            'SELECT target_resource_id FROM relation_resolutions WHERE relation_id = ? ORDER BY target_resource_id',
          )
          .all(row.id) as { target_resource_id: string }[]
      ).map((resolution) => resolution.target_resource_id)
      const target: RelationTarget = row.target_ref
        ? { ref: row.target_ref }
        : {
            field: row.target_field as string,
            value: row.target_value as string,
          }
      return {
        id: row.id,
        sourceResourceId: row.source_resource_id,
        relation: row.relation,
        target,
        resolvedResourceIds,
      }
    })
  }

  traverse(
    resourceId: string,
    relation: string,
    direction: 'outgoing' | 'incoming' | 'both' = 'both',
    options: { readonly includeDeleted?: boolean } = {},
  ): readonly TraversalResult[] {
    const rows = this.db
      .prepare(`
        SELECT id, source_resource_id, relation, target_ref, target_field, target_value
        FROM relations
        WHERE relation = ?
      `)
      .all(relation) as RelationRow[]
    for (const row of rows) this.resolve(row)

    const visible = options.includeDeleted
      ? ''
      : 'AND resources.deleted_at IS NULL'
    const results: TraversalResult[] = []
    if (direction !== 'incoming') {
      const outgoing = this.db
        .prepare(`
          SELECT relation_resolutions.target_resource_id AS resource_id
          FROM relations
          JOIN relation_resolutions ON relation_resolutions.relation_id = relations.id
          JOIN resources ON resources.id = relation_resolutions.target_resource_id
          WHERE relations.source_resource_id = ? AND relations.relation = ? ${visible}
          ORDER BY relation_resolutions.target_resource_id
        `)
        .all(resourceId, relation) as { resource_id: string }[]
      results.push(
        ...outgoing.map((row) => ({
          resourceId: row.resource_id,
          direction: 'outgoing' as const,
        })),
      )
    }
    if (direction !== 'outgoing') {
      const incoming = this.db
        .prepare(`
          SELECT relations.source_resource_id AS resource_id
          FROM relation_resolutions
          JOIN relations ON relations.id = relation_resolutions.relation_id
          JOIN resources ON resources.id = relations.source_resource_id
          WHERE relation_resolutions.target_resource_id = ? AND relations.relation = ? ${visible}
          ORDER BY relations.source_resource_id
        `)
        .all(resourceId, relation) as { resource_id: string }[]
      results.push(
        ...incoming.map((row) => ({
          resourceId: row.resource_id,
          direction: 'incoming' as const,
        })),
      )
    }
    return results
  }

  private resolve(relation: RelationRow): void {
    this.db.transaction(() => {
      this.db
        .prepare('DELETE FROM relation_resolutions WHERE relation_id = ?')
        .run(relation.id)
      const matches = relation.target_ref
        ? (this.db
            .prepare('SELECT id FROM resources WHERE ref = ?')
            .all(relation.target_ref) as { id: string }[])
        : (this.db
            .prepare(`
              SELECT DISTINCT resources.id
              FROM field_index
              JOIN resources ON resources.id = field_index.resource_id
              WHERE field_index.field = ? AND field_index.value_text = ?
            `)
            .all(relation.target_field, relation.target_value) as {
            id: string
          }[])
      const insert = this.db.prepare(
        'INSERT INTO relation_resolutions (relation_id, target_resource_id, resolved_at) VALUES (?, ?, ?)',
      )
      for (const match of matches) insert.run(relation.id, match.id, Date.now())
    })()
  }
}
