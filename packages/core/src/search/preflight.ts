import type {
  FieldType,
  SearchFieldFilter,
  SearchRemoteQuery,
} from '@ctxindex/extension-sdk'
import { CtxindexValidationError } from '../errors'
import type { ProfileRegistry } from '../registry'
import type { LocalSearchFieldFilter } from './types'

export interface SearchPreflightInput {
  readonly text: string
  readonly limit: number
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
}

export interface ResolvedSearchQuery extends SearchRemoteQuery {
  readonly kind?: string
}

function invalid(message: string): never {
  throw new CtxindexValidationError('invalid_filter', message)
}

function parseValue(
  name: string,
  value: string,
  type: FieldType,
): SearchFieldFilter {
  const trimmed = value.trim()
  if (type === 'string' || type === 'string[]') {
    if (!trimmed) invalid(`Invalid value for field "${name}"`)
    return { name, type, value: trimmed }
  }
  if (type === 'number' || type === 'number[]') {
    const parsed = Number(trimmed)
    if (!trimmed || !Number.isFinite(parsed)) {
      invalid(`Invalid number for field "${name}": "${value}"`)
    }
    return { name, type, value: parsed }
  }
  if (type === 'boolean') {
    const normalized = trimmed.toLocaleLowerCase()
    if (normalized !== 'true' && normalized !== 'false') {
      invalid(`Invalid boolean for field "${name}": "${value}"`)
    }
    return { name, type, value: normalized === 'true' }
  }
  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) {
    invalid(`Invalid datetime for field "${name}": "${value}"`)
  }
  return { name, type, value: parsed }
}

export function resolveSearchQuery(
  profiles: ProfileRegistry,
  input: SearchPreflightInput,
): ResolvedSearchQuery {
  if (input.since !== undefined && !Number.isFinite(input.since)) {
    invalid('Invalid occurredAt since value')
  }
  if (input.until !== undefined && !Number.isFinite(input.until)) {
    invalid('Invalid occurredAt until value')
  }
  if (
    input.since !== undefined &&
    input.until !== undefined &&
    input.since > input.until
  ) {
    invalid('occurredAt since must not be after until')
  }
  const rawFields = input.fields ?? []
  if (rawFields.length > 0 && input.kind === undefined) {
    invalid('Field filters require --kind to select a kind')
  }

  let kind: string | undefined
  let fields: SearchFieldFilter[] | undefined
  if (input.kind !== undefined) {
    const resolution = profiles.resolveKind(input.kind)
    if (resolution.status === 'unknown')
      invalid(`Unknown kind "${resolution.kind}"`)
    if (resolution.status === 'ambiguous') {
      invalid(
        `Ambiguous kind alias "${resolution.kind}": ${resolution.candidates.join(', ')}`,
      )
    }
    kind = resolution.id
    fields = rawFields.map((field) => {
      const types = new Set(
        resolution.profiles
          .map((profile) => profile.search?.fields?.[field.name]?.type)
          .filter((type): type is FieldType => type !== undefined),
      )
      if (types.size === 0) {
        invalid(
          `Field "${field.name}" is not declared by selected kind "${kind}"`,
        )
      }
      if (types.size > 1) {
        invalid(
          `Field "${field.name}" has conflicting types across selected kind "${kind}" versions`,
        )
      }
      return parseValue(field.name, field.value, [...types][0] as FieldType)
    })
  }
  return {
    text: input.text,
    limit: input.limit,
    ...(kind === undefined ? {} : { kind }),
    ...(fields === undefined || fields.length === 0 ? {} : { fields }),
    ...(input.since === undefined ? {} : { since: input.since }),
    ...(input.until === undefined ? {} : { until: input.until }),
  }
}
