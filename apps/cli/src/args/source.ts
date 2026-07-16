import type { SourceDescription } from '@ctxindex/core/registry'
import {
  type FlagValue,
  hasHelpFlag,
  listFlag,
  parseFlags,
  stringFlag,
} from './flags'

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
  'source add <adapter-id> [--realm <slug>] [--name|--display-name <name>] [--account <account-id|grant-id>] [--config-json <json>|--config-* <value>] [--search-routing indexed|federated|hybrid] | source list [--realm <slug>] [--format table|compact] [--json] | source remove <source-id>'

function parsePrimitive(value: string, type: string): unknown {
  if (type === 'json') {
    try {
      return JSON.parse(value)
    } catch {
      throw new Error('invalid JSON')
    }
  }
  if (type === 'string') return value
  if (type === 'boolean') {
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error('invalid boolean')
  }
  if (type === 'integer') {
    if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new Error('invalid integer')
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) throw new Error('invalid integer')
    return parsed
  }
  if (type === 'number') {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
      throw new Error('invalid number')
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) throw new Error('invalid number')
    return parsed
  }
  throw new Error(`unsupported type ${type}`)
}

function configJson(
  flags: Record<string, FlagValue>,
  source: SourceDescription | undefined,
): { value?: string; message?: string } {
  const existing = stringFlag(flags, 'config-json')
  const configFlags = Object.keys(flags).filter(
    (flag) => flag.startsWith('config-') && flag !== 'config-json',
  )
  if (existing && configFlags.length > 0) {
    return {
      message:
        'source add: cannot combine --config-json with generated config options',
    }
  }
  if (existing) return { value: existing }
  if (configFlags.length === 0) return {}
  const options = new Map(
    (source?.configOptions ?? []).map((option) => [
      option.flag.slice(2),
      option,
    ]),
  )
  const config: Record<string, unknown> = {}
  for (const flag of configFlags) {
    const option = options.get(flag)
    if (!option) return { message: `source add: unknown option --${flag}` }
    const isArray = option.type.endsWith('[]')
    const type = isArray ? option.type.slice(0, -2) : option.type
    const values = listFlag(flags, flag)
    if (values.length === 0) {
      return { message: `source add: --${flag} requires a value` }
    }
    if (!isArray && values.length > 1) {
      return { message: `source add: --${flag} cannot be repeated` }
    }
    try {
      const parsed = values.map((value) => parsePrimitive(value, type))
      config[option.property] = isArray ? parsed : parsed.at(-1)
    } catch (error) {
      return {
        message: `source add: ${String((error as Error).message)} for --${flag}`,
      }
    }
  }
  return { value: JSON.stringify(config) }
}

function repeatedScalarOption(
  flags: Record<string, FlagValue>,
  keys: readonly string[],
): string | undefined {
  return keys.find((key) => Array.isArray(flags[key]))
}

export function parseSourceArgs(
  args: string[],
  sources: readonly SourceDescription[] = [],
): SourceArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const valueFlags = sources.flatMap((source) =>
    source.configOptions.map((option) => option.flag.slice(2)),
  )
  const { flags, positional } = parseFlags(rest, { valueFlags })
  if (subcommand === 'add') {
    if (positional.length > 1)
      return {
        kind: 'unknown',
        message: `source add: unexpected positional argument "${positional[1]}"`,
      }
    const adapterFlag = stringFlag(flags, 'adapter')
    if (adapterFlag !== undefined && positional[0] !== undefined)
      return {
        kind: 'unknown',
        message:
          'source add: cannot use both positional <adapter-id> and --adapter',
      }
    const rawAdapterId = adapterFlag ?? positional[0]
    if (!rawAdapterId)
      return { kind: 'unknown', message: 'source add: missing <adapter-id>' }
    const adapterId = rawAdapterId
    const source = sources
      .filter((candidate) => candidate.id === adapterId)
      .sort((left, right) => right.version - left.version)[0]
    const allowed = new Set([
      'adapter',
      'realm',
      'name',
      'display-name',
      'account',
      'config-json',
      'search-routing',
      ...(source?.configOptions.map((option) => option.flag.slice(2)) ?? []),
    ])
    const unknown = Object.keys(flags).find((flag) => !allowed.has(flag))
    if (unknown)
      return {
        kind: 'unknown',
        message: `source add: unknown option --${unknown}`,
      }
    const valueFlag = Object.entries(flags).find(
      ([flag, value]) => allowed.has(flag) && (value === true || value === ''),
    )
    if (valueFlag)
      return {
        kind: 'unknown',
        message: `source add: --${valueFlag[0]} requires a value`,
      }
    const repeated = repeatedScalarOption(flags, [
      'adapter',
      'realm',
      'name',
      'display-name',
      'account',
      'config-json',
      'search-routing',
    ])
    if (repeated)
      return {
        kind: 'unknown',
        message: `source add: --${repeated} cannot be repeated`,
      }
    if (!source)
      return {
        kind: 'unknown',
        message: `source add: unknown adapter id "${adapterId}"`,
      }
    const config = configJson(flags, source)
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
    if (positional.length > 0)
      return {
        kind: 'unknown',
        message: `source list: unexpected positional argument "${positional[0]}"`,
      }
    const allowed = new Set(['realm', 'format', 'json'])
    const unknown = Object.keys(flags).find((flag) => !allowed.has(flag))
    if (unknown)
      return {
        kind: 'unknown',
        message: `source list: unknown option --${unknown}`,
      }
    const valueFlag = ['realm', 'format'].find(
      (flag) => flags[flag] === true || flags[flag] === '',
    )
    if (valueFlag)
      return {
        kind: 'unknown',
        message: `source list: --${valueFlag} requires a value`,
      }
    if (flags.json !== undefined && flags.json !== true)
      return {
        kind: 'unknown',
        message: 'source list: --json does not take a value',
      }
    const repeated = repeatedScalarOption(flags, ['realm', 'format'])
    if (repeated)
      return {
        kind: 'unknown',
        message: `source list: --${repeated} cannot be repeated`,
      }
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
    const unknown = Object.keys(flags)[0]
    if (unknown)
      return {
        kind: 'unknown',
        message: `source remove: unknown option --${unknown}`,
      }
    if (positional.length > 1)
      return {
        kind: 'unknown',
        message: `source remove: unexpected positional argument "${positional[1]}"`,
      }
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
