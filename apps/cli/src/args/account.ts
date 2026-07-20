import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type AccountArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly label?: string
      readonly app?: string
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'remove'; readonly label: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const accountUsage =
  'account add <provider> [--app <label>] [--label <label>] | account list [--json] | account remove <label>'

export function parseAccountArgs(args: string[]): AccountArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'add') {
    const unknown = Object.keys(flags).find(
      (flag) => flag !== 'label' && flag !== 'app',
    )
    if (unknown)
      return {
        kind: 'unknown',
        message: `account add: unknown option --${unknown}`,
      }
    if (positional.length === 0)
      return { kind: 'unknown', message: 'account add: missing <provider>' }
    if (positional.length > 1)
      return {
        kind: 'unknown',
        message: `account add: unexpected argument "${positional[1]}"`,
      }
    for (const flag of ['label', 'app']) {
      if (flags[flag] === true || flags[flag] === '')
        return {
          kind: 'unknown',
          message: `account add: --${flag} requires a value`,
        }
      if (Array.isArray(flags[flag]))
        return {
          kind: 'unknown',
          message: `account add: --${flag} cannot be repeated`,
        }
    }
    const label = stringFlag(flags, 'label')
    const app = stringFlag(flags, 'app')
    return {
      kind: 'add',
      provider: positional[0] as string,
      ...(app !== undefined ? { app } : {}),
      ...(label !== undefined ? { label } : {}),
    }
  }
  if (subcommand === 'list') {
    if (
      positional.length > 0 ||
      Object.keys(flags).some((flag) => flag !== 'json')
    )
      return { kind: 'unknown', message: 'account list: unexpected argument' }
    if (flags.json !== undefined && flags.json !== true)
      return {
        kind: 'unknown',
        message: 'account list: --json does not take a value',
      }
    return { kind: 'list', json: flags.json === true }
  }
  if (subcommand === 'remove') {
    if (Object.keys(flags).length > 0)
      return {
        kind: 'unknown',
        message: 'account remove: options are not accepted',
      }
    if (positional.length === 0)
      return { kind: 'unknown', message: 'account remove: missing <label>' }
    if (positional.length > 1)
      return {
        kind: 'unknown',
        message: `account remove: unexpected argument "${positional[1]}"`,
      }
    return { kind: 'remove', label: positional[0] as string }
  }
  return {
    kind: 'unknown',
    message: `account: unknown subcommand "${subcommand ?? ''}"`,
  }
}
