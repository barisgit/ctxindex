import { hasHelpFlag } from './flags'

export type AccountArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const accountUsage = 'account list [--json]'

function unknown(): AccountArgs {
  return { kind: 'unknown', message: `usage: ctxindex ${accountUsage}` }
}

export function parseAccountArgs(args: string[]): AccountArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  if (args.length === 1 && args[0] === 'list')
    return { kind: 'list', json: false }
  if (args.length === 2 && args[0] === 'list' && args[1] === '--json')
    return { kind: 'list', json: true }
  return unknown()
}
