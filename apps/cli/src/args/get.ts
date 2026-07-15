import { parseRef } from '@ctxindex/core'
import { hasHelpFlag, parseFlags } from './flags'

export type GetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const getUsage = 'get <ref> [--json]'

export function parseGetArgs(args: string[]): GetArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, { booleanFlags: ['json'] })
  if (positional.length === 0) {
    return { kind: 'unknown', message: 'get: missing <ref>' }
  }
  if (positional.length !== 1) {
    return { kind: 'unknown', message: 'get: expected exactly one <ref>' }
  }
  const ref = positional[0] as string
  try {
    parseRef(ref)
  } catch {
    return { kind: 'unknown', message: `get: invalid <ref>: ${ref}` }
  }
  return { kind: 'get', ref, json: flags.json === true }
}
