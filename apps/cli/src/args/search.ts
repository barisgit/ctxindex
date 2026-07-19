import {
  type FlagValue,
  hasHelpFlag,
  listFlag,
  parseFlags,
  stringFlag,
} from './flags'

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

export type SearchArgs =
  | {
      readonly kind: 'search'
      readonly input: ExecuteSearchInput
      readonly json: boolean
      readonly refs: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const searchUsage =
  'search [query] [--realm <slug>] [--adapter <id>] [--source <id>] [--kind <kind>] [--field <name=value> ...] [--since <iso>] [--until <iso>] [--limit <n>] [--offset <n>|--continuation <token>] [--include-deleted] [--local-only|--remote] [--explain] [--refs] [--json] (query optional when a filter is present; continuation requires --remote and one --source)'

function parseDateFlag(
  name: string,
  value: FlagValue | undefined,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined || value === false) return { ok: true }
  const raw = Array.isArray(value) ? value.at(-1) : value
  if (raw === true || raw === undefined)
    return { ok: false, message: `search: --${name} requires a date` }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed)
    ? { ok: false, message: `search: invalid --${name} date: ${raw}` }
    : { ok: true, value: parsed }
}

function parseCount(
  name: 'limit' | 'offset',
  value: FlagValue | undefined,
  minimum: number,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined || value === false) return { ok: true }
  const raw = Array.isArray(value) ? value.at(-1) : value
  if (raw === true || raw === undefined)
    return { ok: false, message: `search: --${name} requires a number` }
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= minimum && String(parsed) === raw
    ? { ok: true, value: parsed }
    : { ok: false, message: `search: invalid --${name}: ${raw}` }
}

function parseField(
  raw: string,
): { readonly name: string; readonly value: string } | undefined {
  const equals = raw.indexOf('=')
  if (equals <= 0 || equals === raw.length - 1) return undefined
  return { name: raw.slice(0, equals), value: raw.slice(equals + 1) }
}

export function parseSearchArgs(args: string[]): SearchArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, {
    booleanFlags: [
      'json',
      'refs',
      'include-deleted',
      'explain',
      'local-only',
      'remote',
    ],
    valueFlags: ['limit', 'offset', 'continuation'],
  })
  const text = positional.join(' ').trim()
  if (flags['local-only'] === true && flags.remote === true) {
    return {
      kind: 'unknown',
      message: 'search: --local-only and --remote are mutually exclusive',
    }
  }
  const since = parseDateFlag('since', flags.since)
  if (!since.ok) return { kind: 'unknown', message: since.message }
  const until = parseDateFlag('until', flags.until)
  if (!until.ok) return { kind: 'unknown', message: until.message }
  if (
    since.value !== undefined &&
    until.value !== undefined &&
    since.value > until.value
  ) {
    return {
      kind: 'unknown',
      message: 'search: --since must not be after --until',
    }
  }
  const limit = parseCount('limit', flags.limit, 1)
  if (!limit.ok) return { kind: 'unknown', message: limit.message }
  const offset = parseCount('offset', flags.offset, 0)
  if (!offset.ok) return { kind: 'unknown', message: offset.message }
  const continuation = stringFlag(flags, 'continuation')
  if (flags.continuation !== undefined && continuation === undefined) {
    return {
      kind: 'unknown',
      message: 'search: --continuation requires a token',
    }
  }
  const rawFields = listFlag(flags, 'field')
  const fields = rawFields.map(parseField)
  if (fields.some((field) => field === undefined)) {
    return { kind: 'unknown', message: 'search: --field requires name=value' }
  }
  const kind = stringFlag(flags, 'kind')
  if (fields.length > 0 && kind === undefined) {
    return {
      kind: 'unknown',
      message: 'search: --field requires --kind to select a kind',
    }
  }
  const realms = listFlag(flags, 'realm')
  const adapterId = stringFlag(flags, 'adapter')
  const sourceIds = listFlag(flags, 'source')
  const hasFilter =
    realms.length > 0 ||
    adapterId !== undefined ||
    sourceIds.length > 0 ||
    kind !== undefined ||
    fields.length > 0 ||
    since.value !== undefined ||
    until.value !== undefined ||
    flags['include-deleted'] === true
  const hasRemoteFilter =
    realms.length > 0 ||
    adapterId !== undefined ||
    sourceIds.length > 0 ||
    kind !== undefined ||
    fields.length > 0 ||
    since.value !== undefined ||
    until.value !== undefined
  if (!text && !hasFilter) {
    return {
      kind: 'unknown',
      message:
        'search: provide <query> or at least one filter (--realm/--adapter/--source/--kind/--field/--since/--until/--include-deleted)',
    }
  }
  if (!text && flags.remote === true && !hasRemoteFilter) {
    return {
      kind: 'unknown',
      message:
        'search: query-less --remote requires a narrowing Realm, Adapter, Source, kind, field, or time filter',
    }
  }
  if (continuation !== undefined && flags.remote !== true) {
    return {
      kind: 'unknown',
      message: 'search: --continuation requires --remote',
    }
  }
  if (continuation !== undefined && sourceIds.length !== 1) {
    return {
      kind: 'unknown',
      message: 'search: --continuation requires exactly one --source',
    }
  }
  if (continuation !== undefined && offset.value !== undefined) {
    return {
      kind: 'unknown',
      message: 'search: --continuation cannot be combined with --offset',
    }
  }
  const localExecution =
    (!text && flags.remote !== true) || flags['local-only'] === true
  if (offset.value !== undefined && !localExecution) {
    return {
      kind: 'unknown',
      message:
        'search: --offset requires local execution; omit <query> or add --local-only',
    }
  }
  return {
    kind: 'search',
    json: flags.json === true,
    refs: flags.refs === true,
    input: {
      ...(text ? { text } : {}),
      ...(realms.length === 0 ? {} : { realms }),
      ...(sourceIds.length === 0 ? {} : { sourceIds }),
      ...(adapterId === undefined ? {} : { adapterId }),
      ...(kind === undefined ? {} : { kind }),
      ...(fields.length === 0
        ? {}
        : { fields: fields as { name: string; value: string }[] }),
      ...(since.value === undefined ? {} : { since: since.value }),
      ...(until.value === undefined ? {} : { until: until.value }),
      ...(limit.value === undefined ? {} : { limit: limit.value }),
      ...(offset.value === undefined ? {} : { offset: offset.value }),
      ...(continuation === undefined ? {} : { continuation }),
      ...(flags['include-deleted'] === true ? { includeDeleted: true } : {}),
      ...(flags.explain === true ? { explain: true } : {}),
      ...(flags['local-only'] === true ? { localOnly: true } : {}),
      ...(flags.remote === true ? { remote: true } : {}),
    },
  }
}
