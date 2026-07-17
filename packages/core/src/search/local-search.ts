import type { FieldType } from '@ctxindex/extension-sdk'
import { CtxindexValidationError } from '../errors'
import type { ProfileRegistry } from '../registry/profile-registry'
import type { CtxindexDatabase } from '../storage/db'
import { sanitizeQuery } from './sanitize'
import type {
  LocalSearchChunk,
  LocalSearchFieldFilter,
  LocalSearchQuery,
  LocalSearchResult,
} from './types'

interface ResourceRow {
  readonly id: string
  readonly ref: string
  readonly source_id: string
  readonly realm_slug: string
  readonly profile_id: string
  readonly profile_version: number
  readonly title: string | null
  readonly summary: string | null
  readonly occurred_at: number | null
  readonly deleted_at: number | null
  readonly resource_origin: 'synced' | 'adhoc'
}

interface EnvelopeMatch extends ResourceRow {
  readonly rank: number
}

interface ChunkMatch extends ResourceRow {
  readonly chunk_index: number
  readonly snippet: string
  readonly rank: number
}

type IndexPath = LocalSearchResult['evidence']['indexPaths'][number]

interface Candidate {
  readonly resource: ResourceRow
  readonly filterPaths: readonly IndexPath[]
  envelopeRank?: number
  chunks: LocalSearchChunk[]
}

interface SqlFilter {
  readonly clause: string
  readonly values: readonly (string | number)[]
  readonly indexPaths: readonly IndexPath[]
}

interface ParsedField {
  readonly name: string
  readonly type: FieldType
  readonly column: 'value_text' | 'value_number' | 'value_integer'
  readonly value: string | number
}

function normalizedValues(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()))].filter(
    (value) => value.length > 0,
  )
}

function invalidFilter(message: string): never {
  throw new CtxindexValidationError('invalid_filter', message)
}

function enumerationOrder(
  left: LocalSearchResult,
  right: LocalSearchResult,
): number {
  const a = left.envelope.occurredAt
  const b = right.envelope.occurredAt
  if (a === null && b === null) return left.ref.localeCompare(right.ref)
  if (a === null) return 1
  if (b === null) return -1
  return b - a || left.ref.localeCompare(right.ref)
}

function parseFieldValue(
  filter: LocalSearchFieldFilter,
  type: FieldType,
): ParsedField {
  const value = filter.value.trim()
  if (type === 'string' || type === 'string[]') {
    if (value.length === 0)
      invalidFilter(`Invalid value for field "${filter.name}"`)
    return { name: filter.name, type, column: 'value_text', value }
  }
  if (type === 'number' || type === 'number[]') {
    const number = Number(value)
    if (value.length === 0 || !Number.isFinite(number)) {
      invalidFilter(
        `Invalid number for field "${filter.name}": "${filter.value}"`,
      )
    }
    return { name: filter.name, type, column: 'value_number', value: number }
  }
  if (type === 'boolean') {
    const normalized = value.toLocaleLowerCase()
    if (normalized !== 'true' && normalized !== 'false') {
      invalidFilter(
        `Invalid boolean for field "${filter.name}": "${filter.value}"`,
      )
    }
    return {
      name: filter.name,
      type,
      column: 'value_integer',
      value: normalized === 'true' ? 1 : 0,
    }
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    invalidFilter(
      `Invalid datetime for field "${filter.name}": "${filter.value}"`,
    )
  }
  return { name: filter.name, type, column: 'value_integer', value: timestamp }
}

export class LocalSearchExecutor {
  constructor(
    private readonly db: CtxindexDatabase,
    private readonly profiles: ProfileRegistry,
  ) {}

  search(query: LocalSearchQuery): readonly LocalSearchResult[] {
    const filter = this.buildFilter(query)
    const limit = Math.max(0, query.limit ?? 20)
    const offset = Math.max(0, query.offset ?? 0)
    if (query.text === undefined) {
      return [...this.allResources(filter).values()]
        .map((candidate) => this.result(candidate))
        .sort(enumerationOrder)
        .slice(offset, offset + limit)
    }
    const sanitized = sanitizeQuery(query.text)
    const strict =
      sanitized.strict === '""'
        ? this.allResources(filter)
        : this.match(sanitized.strict, filter)
    const candidates =
      strict.size === 0 && sanitized.relaxed !== sanitized.strict
        ? this.match(sanitized.relaxed, filter)
        : strict

    return [...candidates.values()]
      .map((candidate) => this.result(candidate))
      .sort((left, right) =>
        left.evidence.rank === right.evidence.rank
          ? left.ref.localeCompare(right.ref)
          : left.evidence.rank - right.evidence.rank,
      )
      .slice(offset, offset + limit)
  }

  private buildFilter(query: LocalSearchQuery): SqlFilter {
    const realms = normalizedValues(query.realms)
    const sourceIds = normalizedValues(query.sourceIds)
    this.assertKnownValues('Realm', 'realms', 'slug', realms)
    this.assertKnownValues('Source', 'sources', 'id', sourceIds)

    const clauses: string[] = []
    const values: (string | number)[] = []
    if (realms.length > 0) {
      clauses.push(`realms.slug IN (${realms.map(() => '?').join(', ')})`)
      values.push(...realms)
    }
    if (sourceIds.length > 0) {
      clauses.push(`r.source_id IN (${sourceIds.map(() => '?').join(', ')})`)
      values.push(...sourceIds)
    }

    const fields = query.fields ?? []
    if (fields.length > 0 && query.kind === undefined) {
      invalidFilter('Field filters require a selected kind')
    }
    if (query.kind !== undefined) {
      const resolution = this.profiles.resolveKind(query.kind)
      if (resolution.status === 'unknown') {
        invalidFilter(`Unknown kind "${resolution.kind}"`)
      }
      if (resolution.status === 'ambiguous') {
        invalidFilter(
          `Ambiguous kind alias "${resolution.kind}": ${resolution.candidates.join(', ')}`,
        )
      }
      clauses.push('r.profile_id = ?')
      values.push(resolution.id)
      for (const field of fields) {
        const types = new Set(
          resolution.profiles
            .map((profile) => profile.search?.fields?.[field.name]?.type)
            .filter((type): type is FieldType => type !== undefined),
        )
        if (types.size === 0) {
          invalidFilter(
            `Field "${field.name}" is not declared by kind "${resolution.id}"`,
          )
        }
        if (types.size > 1) {
          invalidFilter(
            `Field "${field.name}" has conflicting types across kind "${resolution.id}" versions`,
          )
        }
        const parsed = parseFieldValue(field, [...types][0] as FieldType)
        clauses.push(
          `EXISTS (SELECT 1 FROM field_index fi WHERE fi.resource_id = r.id AND fi.field = ? AND fi.declared_type = ? AND fi.${parsed.column} = ?)`,
        )
        values.push(parsed.name, parsed.type, parsed.value)
      }
    }

    if (query.since !== undefined) {
      if (!Number.isFinite(query.since))
        invalidFilter('Invalid occurredAt since value')
      clauses.push('r.occurred_at >= ?')
      values.push(query.since)
    }
    if (query.until !== undefined) {
      if (!Number.isFinite(query.until))
        invalidFilter('Invalid occurredAt until value')
      clauses.push('r.occurred_at <= ?')
      values.push(query.until)
    }
    if (
      query.since !== undefined &&
      query.until !== undefined &&
      query.since > query.until
    ) {
      invalidFilter('occurredAt since must not be after until')
    }

    if ((query.deleted ?? 'exclude') === 'exclude')
      clauses.push('r.deleted_at IS NULL')
    if (query.deleted === 'only') clauses.push('r.deleted_at IS NOT NULL')

    return {
      clause: clauses.length === 0 ? '' : ` AND ${clauses.join(' AND ')}`,
      values,
      indexPaths: fields.length === 0 ? [] : ['field_index'],
    }
  }

  private assertKnownValues(
    label: 'Realm' | 'Source',
    table: 'realms' | 'sources',
    column: 'slug' | 'id',
    values: readonly string[],
  ): void {
    if (values.length === 0) return
    const rows = this.db
      .prepare<{ readonly value: string }, string[]>(
        `SELECT ${column} AS value FROM ${table} WHERE ${column} IN (${values.map(() => '?').join(', ')})`,
      )
      .all(...values)
    const known = new Set(rows.map((row) => row.value))
    const unknown = values.filter((value) => !known.has(value)).sort()[0]
    if (unknown !== undefined) invalidFilter(`Unknown ${label} "${unknown}"`)
  }

  private allResources(filter: SqlFilter): Map<string, Candidate> {
    const rows = this.db
      .prepare<ResourceRow, (string | number)[]>(
        `${this.resourceSelect()}
           FROM resources r
           JOIN realms ON realms.id = r.realm_id
          WHERE 1 = 1${filter.clause}`,
      )
      .all(...filter.values)
    return new Map(
      rows.map((resource) => [
        resource.id,
        {
          resource,
          filterPaths:
            filter.indexPaths.length === 0 ? ['resources'] : filter.indexPaths,
          envelopeRank: 0,
          chunks: [],
        },
      ]),
    )
  }

  private match(expression: string, filter: SqlFilter): Map<string, Candidate> {
    const candidates = new Map<string, Candidate>()
    const envelopeRows = this.db
      .prepare<EnvelopeMatch, (string | number)[]>(
        `${this.resourceSelect()}, bm25(resources_fts) AS rank
           FROM resources_fts
           JOIN resources r ON r.rowid = resources_fts.rowid
           JOIN realms ON realms.id = r.realm_id
          WHERE resources_fts MATCH ?${filter.clause}`,
      )
      .all(expression, ...filter.values)

    for (const row of envelopeRows) {
      candidates.set(row.id, {
        resource: row,
        filterPaths: filter.indexPaths,
        envelopeRank: row.rank,
        chunks: [],
      })
    }

    const chunkRows = this.db
      .prepare<ChunkMatch, (string | number)[]>(
        `${this.resourceSelect()}, c.chunk_index,
                snippet(chunks_fts, 0, '<mark>', '</mark>', ' … ', 24) AS snippet,
                bm25(chunks_fts) AS rank
           FROM chunks_fts
           JOIN chunks c ON c.rowid = chunks_fts.rowid
           JOIN resources r ON r.id = c.resource_id
           JOIN realms ON realms.id = r.realm_id
          WHERE chunks_fts MATCH ?${filter.clause}
          ORDER BY rank, c.chunk_index`,
      )
      .all(expression, ...filter.values)

    for (const row of chunkRows) {
      let candidate = candidates.get(row.id)
      if (!candidate) {
        candidate = {
          resource: row,
          filterPaths: filter.indexPaths,
          chunks: [],
        }
        candidates.set(row.id, candidate)
      }
      candidate.chunks.push({
        index: row.chunk_index,
        snippet: row.snippet,
        rank: row.rank,
      })
    }
    return candidates
  }

  private resourceSelect(): string {
    return `SELECT r.id, r.ref, r.source_id, realms.slug AS realm_slug,
                   r.profile_id, r.profile_version, r.title, r.summary,
                   r.occurred_at, r.deleted_at, r.origin AS resource_origin`
  }

  private result(candidate: Candidate): LocalSearchResult {
    const { resource } = candidate
    const chunks = candidate.chunks.slice(0, 3)
    const ranks = [
      ...(candidate.envelopeRank === undefined ? [] : [candidate.envelopeRank]),
      ...chunks.map((chunk) => chunk.rank),
    ]
    return {
      origin: 'local',
      resourceOrigin: resource.resource_origin,
      ref: resource.ref,
      sourceId: resource.source_id,
      realm: resource.realm_slug,
      profile: { id: resource.profile_id, version: resource.profile_version },
      envelope: {
        title: resource.title,
        summary: resource.summary,
        occurredAt: resource.occurred_at,
        deletedAt: resource.deleted_at,
      },
      evidence: {
        rank: Math.min(...ranks),
        indexPaths: [
          ...(candidate.envelopeRank === undefined
            ? []
            : candidate.envelopeRank === 0 && candidate.filterPaths.length > 0
              ? []
              : (['resources_fts'] as const)),
          ...(chunks.length === 0 ? [] : (['chunks_fts'] as const)),
          ...candidate.filterPaths,
        ],
      },
      chunks,
    }
  }
}
