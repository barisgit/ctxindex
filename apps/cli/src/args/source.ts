import { type FlagValue, hasHelpFlag, parseFlags, stringFlag } from './flags'

export type SourceArgs =
  | {
      readonly kind: 'add'
      readonly adapterId: string
      readonly realmSlug?: string
      readonly displayName?: string
      readonly configJson?: string
      readonly account?: string
      readonly searchRouting?: 'indexed' | 'federated' | 'hybrid'
    }
  | {
      readonly kind: 'list'
      readonly realmSlug?: string
      readonly json: boolean
      readonly format: 'table' | 'compact'
    }
  | { readonly kind: 'remove'; readonly sourceId: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const sourceUsage =
  'source add [<adapter-id>] [--adapter <adapter-id>] [--realm <slug>] [--root|--path <path>] [--name|--display-name <name>] [--account <email|grant-id>] [--config-json <json>] [--search-routing indexed|federated|hybrid] | source list [--realm <slug>] [--format table|compact] [--json] | source remove <source-id>'

function normalizeAdapterId(adapterId: string): string {
  return adapterId === 'local-directory' ? 'local.directory' : adapterId
}

function configJson(
  adapterId: string,
  flags: Record<string, FlagValue>,
  positional: string[],
): { value?: string; message?: string } {
  const existing = stringFlag(flags, 'config-json')
  const rootPath =
    stringFlag(flags, 'root') ??
    stringFlag(flags, 'path') ??
    (adapterId === 'local.directory'
      ? stringFlag(flags, 'adapter')
        ? positional[0]
        : positional[1]
      : undefined)
  if (!rootPath) return existing ? { value: existing } : {}
  if (!existing) return { value: JSON.stringify({ root_path: rootPath }) }
  try {
    const parsed = JSON.parse(existing) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { message: 'source add: --config-json must be a JSON object' }
    }
    return {
      value: JSON.stringify({
        ...(parsed as Record<string, unknown>),
        root_path: rootPath,
      }),
    }
  } catch {
    return { message: 'source add: --config-json must be a JSON object' }
  }
}

export function parseSourceArgs(args: string[]): SourceArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'add') {
    const rawAdapterId = stringFlag(flags, 'adapter') ?? positional[0]
    if (!rawAdapterId)
      return { kind: 'unknown', message: 'source add: missing <adapter-id>' }
    const adapterId = normalizeAdapterId(rawAdapterId)
    const config = configJson(adapterId, flags, positional)
    if (config.message) return { kind: 'unknown', message: config.message }
    let result: Extract<SourceArgs, { kind: 'add' }> = {
      kind: 'add',
      adapterId,
    }
    const realmSlug = stringFlag(flags, 'realm')
    const displayName =
      stringFlag(flags, 'name') ?? stringFlag(flags, 'display-name')
    if (realmSlug) result = { ...result, realmSlug }
    if (displayName) result = { ...result, displayName }
    if (config.value) result = { ...result, configJson: config.value }
    const account = stringFlag(flags, 'account')
    if (account) result = { ...result, account }
    const searchRouting = stringFlag(flags, 'search-routing')
    if (
      searchRouting !== undefined &&
      searchRouting !== 'indexed' &&
      searchRouting !== 'federated' &&
      searchRouting !== 'hybrid'
    ) {
      return {
        kind: 'unknown',
        message: `source add: invalid --search-routing: ${searchRouting}`,
      }
    }
    if (searchRouting) result = { ...result, searchRouting }
    return result
  }
  if (subcommand === 'list') {
    const realmSlug = stringFlag(flags, 'realm')
    const rawFormat = stringFlag(flags, 'format') ?? 'table'
    if (rawFormat !== 'table' && rawFormat !== 'compact') {
      return {
        kind: 'unknown',
        message: `source list: invalid --format: ${rawFormat}`,
      }
    }
    return realmSlug
      ? {
          kind: 'list',
          realmSlug,
          json: flags.json === true,
          format: rawFormat,
        }
      : { kind: 'list', json: flags.json === true, format: rawFormat }
  }
  if (subcommand === 'remove') {
    const sourceId = positional[0]
    return sourceId
      ? { kind: 'remove', sourceId }
      : { kind: 'unknown', message: 'source remove: missing <source-id>' }
  }
  return {
    kind: 'unknown',
    message: `source: unknown subcommand "${subcommand ?? ''}"`,
  }
}
