import { hasHelpFlag, parseFlags } from './flags'

export type ExtensionsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseExtensionsArgs(args: string[]): ExtensionsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  if (subcommand !== 'list')
    return {
      kind: 'unknown',
      message: `extensions: unknown subcommand "${subcommand ?? ''}"`,
    }
  const { flags, positional } = parseFlags(rest, { booleanFlags: ['json'] })
  const unknownFlag = Object.keys(flags).find((flag) => flag !== 'json')
  if (unknownFlag)
    return {
      kind: 'unknown',
      message: `extensions list: unknown option --${unknownFlag}`,
    }
  if (flags.json !== undefined && flags.json !== true)
    return {
      kind: 'unknown',
      message: 'extensions list: --json does not take a value',
    }
  if (positional.length > 0)
    return { kind: 'unknown', message: 'extensions list: unexpected argument' }
  return { kind: 'list', json: flags.json === true }
}
