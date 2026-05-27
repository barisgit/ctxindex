import { hasHelpFlag, parseFlags } from './flags'

export type RealmArgs =
  | { readonly kind: 'add'; readonly slug: string }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const realmUsage = 'realm add <slug> | realm list [--json]'

export function parseRealmArgs(args: string[]): RealmArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'add') {
    const slug = positional[0]
    return slug
      ? { kind: 'add', slug }
      : { kind: 'unknown', message: 'realm add: missing <slug>' }
  }
  if (subcommand === 'list') return { kind: 'list', json: flags.json === true }
  return {
    kind: 'unknown',
    message: `realm: unknown subcommand "${subcommand ?? ''}"`,
  }
}
