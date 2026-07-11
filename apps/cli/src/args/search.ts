import type {
  ExecuteSearchInput,
  SearchOutputFormat,
} from '@ctxindex/core/search'
import { type FlagValue, hasHelpFlag, parseFlags, stringFlag } from './flags'

export type SearchArgs =
  | {
      readonly kind: 'search'
      readonly input: ExecuteSearchInput
      readonly json: boolean
      readonly explain: boolean
      readonly format: SearchOutputFormat
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const searchUsage =
  'search <query> [--realm <slug>] [--provider <id>] [--adapter <id>] [--source <id>] [--mime <pattern>] [--kind <kind>] [--since <iso>] [--until <iso>] [--include-deleted] [--limit <n>] [--snippet-chars <n>] [--format legacy|refs|compact|context] [--refs] [--local-only] [--explain] [--json]'

function parseDateFlag(
  name: string,
  value: FlagValue | undefined,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined || value === false) return { ok: true }
  if (value === true)
    return { ok: false, message: `search: --${name} requires a date` }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed)
    ? { ok: false, message: `search: invalid --${name} date: ${value}` }
    : { ok: true, value: parsed }
}

function parsePositiveInteger(
  name: string,
  value: FlagValue | undefined,
): { ok: true; value?: number } | { ok: false; message: string } {
  if (value === undefined || value === false) return { ok: true }
  if (value === true)
    return { ok: false, message: `search: --${name} requires a number` }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 1
    ? { ok: true, value: parsed }
    : { ok: false, message: `search: invalid --${name}: ${value}` }
}

function parseFormat(
  flags: Record<string, FlagValue>,
): { ok: true; value: SearchOutputFormat } | { ok: false; message: string } {
  if (flags.refs === true) return { ok: true, value: 'refs' }
  const raw = stringFlag(flags, 'format')
  if (!raw) return { ok: true, value: 'legacy' }
  if (
    raw === 'legacy' ||
    raw === 'refs' ||
    raw === 'compact' ||
    raw === 'context'
  ) {
    return { ok: true, value: raw }
  }
  return { ok: false, message: `search: invalid --format: ${raw}` }
}

export function parseSearchArgs(args: string[]): SearchArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args)
  const query = positional.join(' ').trim()
  if (!query) return { kind: 'unknown', message: 'search: missing <query>' }
  const since = parseDateFlag('since', flags.since)
  if (!since.ok) return { kind: 'unknown', message: since.message }
  const until = parseDateFlag('until', flags.until)
  if (!until.ok) return { kind: 'unknown', message: until.message }
  const limit = parsePositiveInteger('limit', flags.limit)
  if (!limit.ok) return { kind: 'unknown', message: limit.message }
  const snippetChars = parsePositiveInteger(
    'snippet-chars',
    flags['snippet-chars'],
  )
  if (!snippetChars.ok)
    return { kind: 'unknown', message: snippetChars.message }
  const format = parseFormat(flags)
  if (!format.ok) return { kind: 'unknown', message: format.message }
  let input: ExecuteSearchInput = { query }
  const realmSlug = stringFlag(flags, 'realm')
  const providerFilter = stringFlag(flags, 'provider')
  const adapterFilter = stringFlag(flags, 'adapter')
  const sourceFilter = stringFlag(flags, 'source')
  const mimeFilter = stringFlag(flags, 'mime') ?? stringFlag(flags, 'kind')
  if (realmSlug) input = { ...input, realmSlug }
  if (providerFilter) input = { ...input, providerFilter }
  if (adapterFilter) input = { ...input, adapterFilter }
  if (sourceFilter) input = { ...input, sourceFilter }
  if (mimeFilter) input = { ...input, mimeFilter }
  if (since.value !== undefined) input = { ...input, since: since.value }
  if (until.value !== undefined) input = { ...input, until: until.value }
  if (limit.value !== undefined) input = { ...input, limit: limit.value }
  if (snippetChars.value !== undefined) {
    input = { ...input, snippetChars: snippetChars.value }
  }
  if (flags.explain === true) input = { ...input, explain: true }
  if (flags['local-only'] === true) input = { ...input, localOnly: true }
  if (flags['include-deleted'] === true)
    input = { ...input, includeDeleted: true }
  input = { ...input, output: flags.json === true ? 'json' : 'text' }
  return {
    kind: 'search',
    json: flags.json === true,
    explain: flags.explain === true,
    format: format.value,
    input,
  }
}
