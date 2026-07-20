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
  const { flags, positional, error } = parseFlags(args, {
    booleanFlags: ['json'],
    valueFlags: ['source', 'format'],
    strict: true,
  })
  if (error) {
    const detail =
      error.kind === 'unknown'
        ? `unknown flag ${error.flag}`
        : error.kind === 'duplicate'
          ? `duplicate ${error.flag}`
          : `${error.flag} requires a non-empty value`
    return { kind: 'unknown', message: `status: ${detail}` }
  }
  if (args.filter((arg) => arg === '--json').length > 1) {
    return { kind: 'unknown', message: 'status: duplicate --json' }
  }
  if (positional.length > 0) {
    return {
      kind: 'unknown',
      message: `status: unexpected argument: ${positional[0]}`,
    }
  }
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
