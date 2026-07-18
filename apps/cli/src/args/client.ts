import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type ClientArgs =
  | { readonly kind: 'add'; readonly provider: string; readonly label?: string }
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'remove'
      readonly provider: string
      readonly label: string
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const clientUsage =
  'client add <provider> [--label <label>] --from-env | client list [--json] | client remove <provider> <label>'

export function parseClientArgs(args: string[]): ClientArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'add') {
    const unknown = Object.keys(flags).find(
      (flag) => flag !== 'label' && flag !== 'from-env',
    )
    if (unknown)
      return {
        kind: 'unknown',
        message: `client add: unknown option --${unknown}`,
      }
    if (positional.length === 0)
      return { kind: 'unknown', message: 'client add: missing <provider>' }
    if (positional.length > 1)
      return {
        kind: 'unknown',
        message: `client add: unexpected argument "${positional[1]}"`,
      }
    if (flags['from-env'] !== true)
      return {
        kind: 'unknown',
        message: 'client add: --from-env is required',
      }
    if (flags.label === true || flags.label === '')
      return {
        kind: 'unknown',
        message: 'client add: --label requires a value',
      }
    if (Array.isArray(flags.label))
      return {
        kind: 'unknown',
        message: 'client add: --label cannot be repeated',
      }
    const label = stringFlag(flags, 'label')
    return {
      kind: 'add',
      provider: positional[0] as string,
      ...(label !== undefined ? { label } : {}),
    }
  }
  if (subcommand === 'list') {
    if (
      positional.length > 0 ||
      Object.keys(flags).some((flag) => flag !== 'json')
    )
      return { kind: 'unknown', message: 'client list: unexpected argument' }
    if (flags.json !== undefined && flags.json !== true)
      return {
        kind: 'unknown',
        message: 'client list: --json does not take a value',
      }
    return { kind: 'list', json: flags.json === true }
  }
  if (subcommand === 'remove') {
    if (Object.keys(flags).length > 0)
      return {
        kind: 'unknown',
        message: 'client remove: options are not accepted',
      }
    if (positional.length < 1)
      return { kind: 'unknown', message: 'client remove: missing <provider>' }
    if (positional.length < 2)
      return { kind: 'unknown', message: 'client remove: missing <label>' }
    if (positional.length > 2)
      return {
        kind: 'unknown',
        message: `client remove: unexpected argument "${positional[2]}"`,
      }
    return {
      kind: 'remove',
      provider: positional[0] as string,
      label: positional[1] as string,
    }
  }
  return {
    kind: 'unknown',
    message: `client: unknown subcommand "${subcommand ?? ''}"`,
  }
}
