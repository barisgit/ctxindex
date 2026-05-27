import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type StatusArgs =
  | {
      readonly kind: 'status'
      readonly sourceId?: string
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const statusUsage = 'status [--source <id>] [--json]'

export function parseStatusArgs(args: string[]): StatusArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags } = parseFlags(args)
  const sourceId = stringFlag(flags, 'source')
  return sourceId
    ? { kind: 'status', sourceId, json: flags.json === true }
    : { kind: 'status', json: flags.json === true }
}
