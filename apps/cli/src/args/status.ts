import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type StatusArgs =
  | {
      readonly kind: 'status'
      readonly sourceId?: string
      readonly json: boolean
      readonly format: 'summary' | 'compact'
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const statusUsage =
  'status [--source <id>] [--format summary|compact] [--json]'

export function parseStatusArgs(args: string[]): StatusArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags } = parseFlags(args)
  const sourceId = stringFlag(flags, 'source')
  const rawFormat = stringFlag(flags, 'format') ?? 'summary'
  if (rawFormat !== 'summary' && rawFormat !== 'compact') {
    return {
      kind: 'unknown',
      message: `status: invalid --format: ${rawFormat}`,
    }
  }
  return sourceId
    ? { kind: 'status', sourceId, json: flags.json === true, format: rawFormat }
    : { kind: 'status', json: flags.json === true, format: rawFormat }
}
