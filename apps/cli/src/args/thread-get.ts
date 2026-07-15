import { parseRef } from '@ctxindex/core'
import { hasHelpFlag, parseFlags } from './flags'

export type ThreadGetArgs =
  | { readonly kind: 'get'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const threadGetUsage = 'thread get <ref> [--json]'

export function parseThreadGetArgs(args: string[]): ThreadGetArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, { booleanFlags: ['json'] })
  const unknownFlag = Object.keys(flags).find((flag) => flag !== 'json')
  if (unknownFlag) {
    return {
      kind: 'unknown',
      message: `thread get: unknown flag --${unknownFlag}`,
    }
  }
  if (positional.length === 0) {
    return { kind: 'unknown', message: 'thread get: missing <ref>' }
  }
  if (positional.length !== 1) {
    return {
      kind: 'unknown',
      message: 'thread get: expected exactly one <ref>',
    }
  }
  const ref = positional[0] as string
  try {
    parseRef(ref)
  } catch {
    return { kind: 'unknown', message: `thread get: invalid <ref>: ${ref}` }
  }
  return { kind: 'get', ref, json: flags.json === true }
}
