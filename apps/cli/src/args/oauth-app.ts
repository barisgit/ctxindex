import { hasHelpFlag, parseFlags } from './flags'

export type OAuthAppArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly label: string
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'remove'
      readonly provider: string
      readonly label: string
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const oauthAppUsage =
  'oauth-app add <provider> <label> --from-env | oauth-app list [--json] | oauth-app remove <provider> <label>'

export function parseOAuthAppArgs(args: string[]): OAuthAppArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'add') {
    const unknown = Object.keys(flags).find((flag) => flag !== 'from-env')
    if (unknown)
      return {
        kind: 'unknown',
        message: `oauth-app add: unknown option --${unknown}`,
      }
    if (positional.length === 0)
      return { kind: 'unknown', message: 'oauth-app add: missing <provider>' }
    if (positional.length === 1)
      return { kind: 'unknown', message: 'oauth-app add: missing <label>' }
    if (positional.length > 2)
      return {
        kind: 'unknown',
        message: `oauth-app add: unexpected argument "${positional[2]}"`,
      }
    if (flags['from-env'] !== true)
      return {
        kind: 'unknown',
        message: 'oauth-app add: --from-env is required',
      }
    return {
      kind: 'add',
      provider: positional[0] as string,
      label: positional[1] as string,
    }
  }
  if (subcommand === 'list') {
    if (
      positional.length > 0 ||
      Object.keys(flags).some((flag) => flag !== 'json')
    )
      return { kind: 'unknown', message: 'oauth-app list: unexpected argument' }
    if (flags.json !== undefined && flags.json !== true)
      return {
        kind: 'unknown',
        message: 'oauth-app list: --json does not take a value',
      }
    return { kind: 'list', json: flags.json === true }
  }
  if (subcommand === 'remove') {
    if (Object.keys(flags).length > 0)
      return {
        kind: 'unknown',
        message: 'oauth-app remove: options are not accepted',
      }
    if (positional.length === 0)
      return {
        kind: 'unknown',
        message: 'oauth-app remove: missing <provider>',
      }
    if (positional.length === 1)
      return { kind: 'unknown', message: 'oauth-app remove: missing <label>' }
    if (positional.length > 2)
      return {
        kind: 'unknown',
        message: `oauth-app remove: unexpected argument "${positional[2]}"`,
      }
    return {
      kind: 'remove',
      provider: positional[0] as string,
      label: positional[1] as string,
    }
  }
  return {
    kind: 'unknown',
    message: `oauth-app: unknown subcommand "${subcommand ?? ''}"`,
  }
}
