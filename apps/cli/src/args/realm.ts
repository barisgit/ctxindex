import {
  hasHelpFlag,
  type ParseFlagsError,
  parseFlags,
  stringFlag,
} from './flags'

export type RealmArgs =
  | { readonly kind: 'add'; readonly slug: string; readonly name?: string }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const realmUsage =
  'realm add <slug> [--name <display-name>] | realm list [--json]'

function flagError(command: string, error: ParseFlagsError): RealmArgs {
  if (error.kind === 'unknown') {
    return {
      kind: 'unknown',
      message: `${command}: unknown flag ${error.flag}`,
    }
  }
  if (error.kind === 'duplicate') {
    return {
      kind: 'unknown',
      message: `${command}: ${error.flag} may be specified once`,
    }
  }
  return {
    kind: 'unknown',
    message: `${command}: ${error.flag} requires a value`,
  }
}

export function parseRealmArgs(args: string[]): RealmArgs {
  const [subcommand, ...rest] = args
  if (subcommand === 'add') {
    const { flags, positional, error } = parseFlags(rest, {
      valueFlags: ['name'],
      strict: true,
    })
    if (error) {
      return hasHelpFlag(rest)
        ? { kind: 'help' }
        : flagError('realm add', error)
    }
    const slug = positional[0]
    if (!slug) return { kind: 'unknown', message: 'realm add: missing <slug>' }
    if (positional.length > 1) {
      return {
        kind: 'unknown',
        message: `realm add: unexpected argument "${positional[1]}"`,
      }
    }
    const name = stringFlag(flags, 'name')
    return {
      kind: 'add',
      slug,
      ...(name !== undefined ? { name } : {}),
    }
  }
  if (subcommand === 'list') {
    const { flags, positional, error } = parseFlags(rest, {
      booleanFlags: ['json'],
      strict: true,
    })
    if (error) {
      return hasHelpFlag(rest)
        ? { kind: 'help' }
        : flagError('realm list', error)
    }
    if (rest.filter((arg) => arg === '--json').length > 1) {
      return {
        kind: 'unknown',
        message: 'realm list: --json may be specified once',
      }
    }
    if (positional.length > 0) {
      return {
        kind: 'unknown',
        message: `realm list: unexpected argument "${positional[0]}"`,
      }
    }
    return { kind: 'list', json: flags.json === true }
  }
  if (hasHelpFlag(args)) return { kind: 'help' }
  return {
    kind: 'unknown',
    message: `realm: unknown subcommand "${subcommand ?? ''}"`,
  }
}
