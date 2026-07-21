import type { CtxParsedArgs } from '../command-model'
import {
  type OutputFormat,
  resolveOutputFormat,
  structuredOutputArgs,
} from '../format/output'

export const searchArgs = {
  query: { type: 'positional', required: false, description: 'Query text' },
  realm: {
    type: 'string',
    multiple: true,
    description: 'Exact Realm slug (repeatable)',
  },
  adapter: { type: 'string', description: 'Adapter ID' },
  source: {
    type: 'string',
    multiple: true,
    description: 'Exact Source label or ID (repeatable)',
  },
  kind: { type: 'string', description: 'Profile kind or alias' },
  field: {
    type: 'string',
    multiple: true,
    description: 'Typed equality filter name=value (repeatable)',
  },
  since: { type: 'string', description: 'Start ISO date' },
  until: { type: 'string', description: 'End ISO date' },
  limit: { type: 'string', description: 'Result limit' },
  offset: { type: 'string', description: 'Local pagination offset' },
  continuation: {
    type: 'string',
    description: 'Opaque continuation for one exact remote Source',
  },
  'include-deleted': {
    type: 'boolean',
    description: 'Include deleted local Resources',
  },
  refs: { type: 'boolean', description: 'Print Resource Refs only' },
  'local-only': { type: 'boolean', description: 'Search local only' },
  remote: { type: 'boolean', description: 'Search remote Sources only' },
  explain: { type: 'boolean', description: 'Explain per-Source routing' },
  ...structuredOutputArgs,
} as const

export type SearchCommandArgs = CtxParsedArgs<typeof searchArgs>

export interface ExecuteSearchInput {
  readonly text?: string
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly adapterId?: string
  readonly kind?: string
  readonly fields?: readonly { readonly name: string; readonly value: string }[]
  readonly since?: number
  readonly until?: number
  readonly limit?: number
  readonly offset?: number
  readonly continuation?: string
  readonly includeDeleted?: boolean
  readonly explain?: boolean
  readonly localOnly?: boolean
  readonly remote?: boolean
}

export interface ResolvedSearchArgs {
  readonly input: ExecuteSearchInput
  readonly format: OutputFormat
  readonly refs: boolean
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: 'invalid_args' })
}

function parseDate(
  name: 'since' | 'until',
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) return undefined
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) invalid(`search: invalid --${name} date: ${raw}`)
  return parsed
}

function parseCount(
  name: 'limit' | 'offset',
  raw: string | undefined,
  minimum: number,
): number | undefined {
  if (raw === undefined) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < minimum || String(parsed) !== raw) {
    invalid(`search: invalid --${name}: ${raw}`)
  }
  return parsed
}

function parseField(raw: string): {
  readonly name: string
  readonly value: string
} {
  const equals = raw.indexOf('=')
  if (equals <= 0 || equals === raw.length - 1) {
    invalid('search: --field requires name=value')
  }
  return { name: raw.slice(0, equals), value: raw.slice(equals + 1) }
}

export function resolveSearchArgs(args: SearchCommandArgs): ResolvedSearchArgs {
  const text = args.query?.trim()
  const since = parseDate('since', args.since)
  const until = parseDate('until', args.until)
  const limit = parseCount('limit', args.limit, 1)
  const offset = parseCount('offset', args.offset, 0)
  const continuation = args.continuation
  const fields = args.field.map(parseField)

  if (args['local-only'] === true && args.remote === true) {
    invalid('search: --local-only and --remote are mutually exclusive')
  }
  if (since !== undefined && until !== undefined && since > until) {
    invalid('search: --since must not be after --until')
  }
  if (continuation !== undefined && continuation.trim().length === 0) {
    invalid('search: --continuation requires a token')
  }
  if (fields.length > 0 && args.kind === undefined) {
    invalid('search: --field requires --kind to select a kind')
  }

  const hasFilter =
    args.realm.length > 0 ||
    args.adapter !== undefined ||
    args.source.length > 0 ||
    args.kind !== undefined ||
    fields.length > 0 ||
    since !== undefined ||
    until !== undefined ||
    args['include-deleted'] === true
  const hasRemoteFilter =
    args.realm.length > 0 ||
    args.adapter !== undefined ||
    args.source.length > 0 ||
    args.kind !== undefined ||
    fields.length > 0 ||
    since !== undefined ||
    until !== undefined
  if (!text && !hasFilter) {
    invalid(
      'search: provide <query> or at least one filter (--realm/--adapter/--source/--kind/--field/--since/--until/--include-deleted)',
    )
  }
  if (!text && args.remote === true && !hasRemoteFilter) {
    invalid(
      'search: query-less --remote requires a narrowing Realm, Adapter, Source, kind, field, or time filter',
    )
  }
  if (continuation !== undefined && args.remote !== true) {
    invalid('search: --continuation requires --remote')
  }
  if (continuation !== undefined && args.source.length !== 1) {
    invalid('search: --continuation requires exactly one --source')
  }
  if (continuation !== undefined && offset !== undefined) {
    invalid('search: --continuation cannot be combined with --offset')
  }
  const localExecution =
    (!text && args.remote !== true) || args['local-only'] === true
  if (offset !== undefined && !localExecution) {
    invalid(
      'search: --offset requires local execution; omit <query> or add --local-only',
    )
  }

  return {
    format: resolveOutputFormat(args),
    refs: args.refs === true,
    input: {
      ...(text ? { text } : {}),
      ...(args.realm.length === 0 ? {} : { realms: args.realm }),
      ...(args.source.length === 0 ? {} : { sourceIds: args.source }),
      ...(args.adapter === undefined ? {} : { adapterId: args.adapter }),
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(fields.length === 0 ? {} : { fields }),
      ...(since === undefined ? {} : { since }),
      ...(until === undefined ? {} : { until }),
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
      ...(continuation === undefined ? {} : { continuation }),
      ...(args['include-deleted'] === true ? { includeDeleted: true } : {}),
      ...(args.explain === true ? { explain: true } : {}),
      ...(args['local-only'] === true ? { localOnly: true } : {}),
      ...(args.remote === true ? { remote: true } : {}),
    },
  }
}
