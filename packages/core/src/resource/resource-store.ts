import type {
  AnyProfileDefinition,
  FieldType,
  ProfileRelationTarget,
} from '@ctxindex/extension-sdk'
import { CtxindexValidationError } from '../errors'
import { newId } from '../ids'
import { parseRef } from '../ref/ref'
import type {
  ProfileRegistry,
  UnknownProfileWarning,
} from '../registry/profile-registry'
import { RelationStore, type RelationWrite } from '../relation/relation-store'
import { normalizeStorageError } from '../storage/contention'
import type { CtxindexDatabase } from '../storage/db'

declare const __CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__: boolean | undefined

const STORAGE_ACQUIRE_TRACE = '[ctxindex-e2e] storage-acquire\n'

function traceStorageAcquireForE2e(): void {
  if (
    typeof __CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__ === 'undefined' ||
    !__CTXINDEX_E2E_TRACE_STORAGE_ACQUIRE__
  )
    return
  try {
    process.stderr.write(STORAGE_ACQUIRE_TRACE)
  } catch {
    // Test-only observation must never alter Resource persistence.
  }
}

export type ResourceOrigin = 'synced' | 'adhoc'

export interface ResourceProfileIdentity {
  readonly id: string
  readonly version: number
}

export interface ResourceUpsert {
  readonly ref: string
  readonly sourceId: string
  readonly profile: ResourceProfileIdentity
  readonly origin: ResourceOrigin
  readonly completeness: 'partial' | 'complete'
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload?: unknown
}

function relationWrites(
  profile: AnyProfileDefinition | undefined,
  payload: unknown,
): readonly RelationWrite[] {
  if (!profile || payload === undefined) return []
  const writes: RelationWrite[] = []
  for (const [relation, extract] of Object.entries(profile.relations ?? {})) {
    const extracted = extract(payload)
    const targets = Array.isArray(extracted)
      ? extracted
      : extracted === null || extracted === undefined
        ? []
        : [extracted]
    for (const candidate of targets) {
      if (typeof candidate !== 'object' || candidate === null) {
        throw new TypeError(
          `Profile relation "${relation}" returned an invalid target`,
        )
      }
      const target = candidate as Partial<ProfileRelationTarget> &
        Record<string, unknown>
      if (typeof target.ref === 'string') {
        writes.push({ relation, target: { ref: target.ref } })
      } else if (
        typeof target.field === 'string' &&
        typeof target.value === 'string'
      ) {
        writes.push({
          relation,
          target: { field: target.field, value: target.value },
        })
      } else {
        throw new TypeError(
          `Profile relation "${relation}" returned an invalid target`,
        )
      }
    }
  }
  return writes
}

export interface ResourceUpsertResult {
  readonly resourceId: string
  readonly warnings: readonly UnknownProfileWarning[]
}

export interface ResourceRemoval {
  readonly ref: string
  readonly sourceId: string
  readonly deletedAt: number
}

export interface StoredResource {
  readonly id: string
  readonly ref: string
  readonly sourceId: string
  readonly realmId: string
  readonly profile: ResourceProfileIdentity
  readonly origin: ResourceOrigin
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly providerUpdatedAt: number | null
  readonly deletedAt: number | null
  readonly hydratedAt: number | null
  readonly payload: unknown | null
  readonly createdAt: number
  readonly updatedAt: number
}

interface EncodedFieldValue {
  readonly text: string | null
  readonly number: number | null
  readonly integer: number | null
}

function encodeFieldValue(
  field: string,
  type: FieldType | 'boolean[]' | 'datetime[]',
  value: unknown,
): EncodedFieldValue {
  const scalarType = type.endsWith('[]') ? type.slice(0, -2) : type
  if (scalarType === 'string' && typeof value === 'string') {
    return { text: value, number: null, integer: null }
  }
  if (
    scalarType === 'number' &&
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return { text: null, number: value, integer: null }
  }
  if (scalarType === 'boolean' && typeof value === 'boolean') {
    return { text: null, number: null, integer: value ? 1 : 0 }
  }
  if (
    scalarType === 'datetime' &&
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return { text: null, number: null, integer: value.getTime() }
  }
  throw new TypeError(
    `Profile field "${field}" returned an invalid ${type} value`,
  )
}

function fieldValues(
  field: string,
  type: FieldType | 'boolean[]' | 'datetime[]',
  value: unknown,
): readonly unknown[] {
  if (value === null || value === undefined) return []
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) {
      throw new TypeError(
        `Profile field "${field}" returned a non-array ${type} value`,
      )
    }
    return value
  }
  if (Array.isArray(value)) {
    throw new TypeError(
      `Profile field "${field}" returned an array for scalar ${type}`,
    )
  }
  return [value]
}

export class ResourceStore {
  private readonly relations: RelationStore

  constructor(
    private readonly db: CtxindexDatabase,
    private readonly profiles: ProfileRegistry,
  ) {
    this.relations = new RelationStore(db)
  }

  upsert(input: ResourceUpsert): ResourceUpsertResult {
    const result = this.upsertMany([input])[0]
    if (!result) throw new Error('Resource batch produced no result')
    return result
  }

  upsertMany(
    inputs: readonly ResourceUpsert[],
  ): readonly ResourceUpsertResult[] {
    const deduplicated = new Map<string, ResourceUpsert>()
    for (const input of inputs) {
      const parsedRef = parseRef(input.ref)
      if (parsedRef.sourceId !== input.sourceId) {
        throw new CtxindexValidationError(
          'ref_source_mismatch',
          `Ref Source "${parsedRef.sourceId}" does not match operation Source "${input.sourceId}"`,
        )
      }
      deduplicated.set(input.ref, input)
    }
    if (deduplicated.size === 0) return []

    const writeBatch = () =>
      [...deduplicated.values()].map((input) => this.upsertOne(input))
    if (this.db.inTransaction) {
      try {
        return this.db.transaction(writeBatch)()
      } catch (error) {
        normalizeStorageError(error)
      }
    }

    let began = false
    try {
      traceStorageAcquireForE2e()
      this.db.exec('BEGIN IMMEDIATE')
      began = true
      const results = writeBatch()
      this.db.exec('COMMIT')
      return results
    } catch (error) {
      if (began && this.db.inTransaction) this.db.exec('ROLLBACK')
      normalizeStorageError(error)
    }
  }

  get(
    ref: string,
    options: { readonly includeDeleted?: boolean } = {},
  ): StoredResource | null {
    parseRef(ref)
    const row = this.db
      .prepare(
        `
        SELECT id, ref, source_id, realm_id, profile_id, profile_version,
               origin, title, summary, occurred_at, provider_updated_at,
               deleted_at, hydrated_at, payload_json, created_at, updated_at
        FROM resources
        WHERE ref = ? ${options.includeDeleted ? '' : 'AND deleted_at IS NULL'}
      `,
      )
      .get(ref) as {
      id: string
      ref: string
      source_id: string
      realm_id: string
      profile_id: string
      profile_version: number
      origin: ResourceOrigin
      title: string | null
      summary: string | null
      occurred_at: number | null
      provider_updated_at: number | null
      deleted_at: number | null
      hydrated_at: number | null
      payload_json: string | null
      created_at: number
      updated_at: number
    } | null
    if (!row) return null
    return {
      id: row.id,
      ref: row.ref,
      sourceId: row.source_id,
      realmId: row.realm_id,
      profile: { id: row.profile_id, version: row.profile_version },
      origin: row.origin,
      title: row.title,
      summary: row.summary,
      occurredAt: row.occurred_at,
      providerUpdatedAt: row.provider_updated_at,
      deletedAt: row.deleted_at,
      hydratedAt: row.hydrated_at,
      payload: row.payload_json === null ? null : JSON.parse(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  remove(input: ResourceRemoval): void {
    const parsedRef = parseRef(input.ref)
    if (parsedRef.sourceId !== input.sourceId) {
      throw new CtxindexValidationError(
        'ref_source_mismatch',
        `Ref Source "${parsedRef.sourceId}" does not match operation Source "${input.sourceId}"`,
      )
    }
    this.db.transaction(() => {
      const row = this.db
        .prepare(
          'SELECT id, origin FROM resources WHERE ref = ? AND source_id = ?',
        )
        .get(input.ref, input.sourceId) as {
        id: string
        origin: ResourceOrigin
      } | null
      if (!row) return
      if (row.origin === 'adhoc') {
        this.db.prepare('DELETE FROM resources WHERE id = ?').run(row.id)
        return
      }
      this.db
        .prepare(
          'UPDATE resources SET deleted_at = ?, updated_at = ? WHERE id = ?',
        )
        .run(input.deletedAt, Date.now(), row.id)
    })()
  }

  private upsertOne(input: ResourceUpsert): ResourceUpsertResult {
    const existing = this.db
      .prepare('SELECT hydrated_at FROM resources WHERE ref = ?')
      .get(input.ref) as { hydrated_at: number | null } | null
    if (existing?.hydrated_at != null && input.completeness === 'partial') {
      return { resourceId: this.write(input), warnings: [] }
    }

    const resolution = this.profiles.resolve(input.profile)
    const warnings: UnknownProfileWarning[] = []
    if (resolution.status === 'degraded') {
      warnings.push({
        code: 'unknown_profile_version',
        profileId: resolution.id,
        profileVersion: resolution.version,
      })
    }
    const payload =
      resolution.status === 'known' && input.payload !== undefined
        ? resolution.profile.schema.parse(input.payload)
        : undefined
    return {
      resourceId: this.write(
        input,
        resolution.status === 'known' ? resolution.profile : undefined,
        payload,
      ),
      warnings,
    }
  }

  private write(
    input: ResourceUpsert,
    profile?: AnyProfileDefinition,
    payload?: unknown,
  ): string {
    const source = this.db
      .prepare('SELECT realm_id FROM sources WHERE id = ?')
      .get(input.sourceId) as { realm_id: string } | null
    if (!source) throw new Error(`Unknown Source "${input.sourceId}"`)

    const existing = this.db
      .prepare(
        'SELECT id, created_at, origin, hydrated_at FROM resources WHERE ref = ?',
      )
      .get(input.ref) as {
      id: string
      created_at: number
      origin: ResourceOrigin
      hydrated_at: number | null
    } | null
    const now = Date.now()
    const resourceId = existing?.id ?? newId()
    const origin =
      existing?.origin === 'synced' || input.origin === 'synced'
        ? 'synced'
        : 'adhoc'
    let title = input.title ?? null
    let summary = input.summary ?? null
    let occurredAt = input.occurredAt ?? null
    let chunks: readonly string[] = []

    if (profile && payload !== undefined) {
      title = profile.search?.title?.(payload) ?? title
      summary = profile.search?.summary?.(payload) ?? summary
      occurredAt =
        profile.search?.occurredAt?.(payload)?.getTime() ?? occurredAt
      chunks = profile.search?.chunks?.(payload) ?? []
      if (!chunks.every((chunk) => typeof chunk === 'string')) {
        throw new TypeError(
          'Profile chunk extractor returned a non-string value',
        )
      }
    }
    const relations = relationWrites(profile, payload)
    const preserveContent =
      existing?.hydrated_at != null && input.completeness === 'partial'

    if (preserveContent) {
      this.db
        .prepare(
          `
          UPDATE resources SET
            source_id = ?,
            realm_id = ?,
            title = ?,
            summary = ?,
            occurred_at = ?,
            provider_updated_at = ?,
            deleted_at = NULL,
            origin = ?,
            updated_at = ?
          WHERE id = ?
        `,
        )
        .run(
          input.sourceId,
          source.realm_id,
          title,
          summary,
          occurredAt,
          input.providerUpdatedAt ?? null,
          origin,
          now,
          resourceId,
        )
      return resourceId
    }

    this.db
      .prepare(
        `
      INSERT INTO resources (
        id, ref, source_id, realm_id, profile_id, profile_version, title, summary,
        occurred_at, provider_updated_at, deleted_at, hydrated_at, origin,
        payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      ON CONFLICT(ref) DO UPDATE SET
        source_id = excluded.source_id,
        realm_id = excluded.realm_id,
        profile_id = excluded.profile_id,
        profile_version = excluded.profile_version,
        title = excluded.title,
        summary = excluded.summary,
        occurred_at = excluded.occurred_at,
        provider_updated_at = excluded.provider_updated_at,
        deleted_at = NULL,
        hydrated_at = excluded.hydrated_at,
        origin = excluded.origin,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `,
      )
      .run(
        resourceId,
        input.ref,
        input.sourceId,
        source.realm_id,
        input.profile.id,
        input.profile.version,
        title,
        summary,
        occurredAt,
        input.providerUpdatedAt ?? null,
        input.completeness === 'complete' ? now : null,
        origin,
        profile && payload !== undefined ? JSON.stringify(payload) : null,
        existing?.created_at ?? now,
        now,
      )

    this.db
      .prepare('DELETE FROM field_index WHERE resource_id = ?')
      .run(resourceId)
    this.db.prepare('DELETE FROM chunks WHERE resource_id = ?').run(resourceId)

    if (profile && payload !== undefined) {
      const insertField = this.db.prepare(`
        INSERT INTO field_index (
          id, resource_id, field, declared_type, ordinal,
          value_text, value_number, value_integer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const [field, definition] of Object.entries(
        profile.search?.fields ?? {},
      )) {
        const values = fieldValues(
          field,
          definition.type,
          definition.extract(payload),
        )
        for (const [ordinal, value] of values.entries()) {
          const encoded = encodeFieldValue(field, definition.type, value)
          insertField.run(
            newId(),
            resourceId,
            field,
            definition.type,
            ordinal,
            encoded.text,
            encoded.number,
            encoded.integer,
          )
        }
      }

      const insertChunk = this.db.prepare(
        'INSERT INTO chunks (id, resource_id, chunk_index, content, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      for (const [index, content] of chunks.entries()) {
        insertChunk.run(newId(), resourceId, index, content, now)
      }
    }

    this.relations.replace(resourceId, relations)

    return resourceId
  }
}
