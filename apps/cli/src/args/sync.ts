import type { SyncMode } from '@ctxindex/extension-sdk'
import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type SyncArgs =
  | {
      readonly kind: 'run'
      readonly sourceId?: string
      readonly mode: SyncMode
      readonly json: boolean
      readonly format: 'summary' | 'events' | 'compact'
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const syncUsage =
  'sync [--source <id>] [--mode sync|resync|diff] [--format summary|events|compact] [--json]'

function parseMode(value: string | undefined): SyncMode | null {
  if (value === undefined) return 'sync'
  if (value === 'sync' || value === 'resync' || value === 'diff') return value
  return null
}

export function parseSyncArgs(args: string[]): SyncArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional, error } = parseFlags(args, {
    booleanFlags: ['json'],
    valueFlags: ['source', 'mode', 'format'],
    strict: true,
  })
  if (error) {
    const detail =
      error.kind === 'unknown'
        ? `unknown flag ${error.flag}`
        : error.kind === 'duplicate'
          ? `duplicate ${error.flag}`
          : `${error.flag} requires a non-empty value`
    return { kind: 'unknown', message: `sync: ${detail}` }
  }
  if (args.filter((arg) => arg === '--json').length > 1) {
    return { kind: 'unknown', message: 'sync: duplicate --json' }
  }
  if (positional.length > 0) {
    return {
      kind: 'unknown',
      message: `sync: unexpected argument: ${positional[0]}`,
    }
  }
  const mode = parseMode(stringFlag(flags, 'mode'))
  if (!mode) {
    return {
      kind: 'unknown',
      message: 'sync: --mode must be sync, resync, or diff',
    }
  }
  const sourceId = stringFlag(flags, 'source')
  const rawFormat = stringFlag(flags, 'format') ?? 'summary'
  if (
    rawFormat !== 'summary' &&
    rawFormat !== 'events' &&
    rawFormat !== 'compact'
  ) {
    return { kind: 'unknown', message: `sync: invalid --format: ${rawFormat}` }
  }
  return {
    kind: 'run',
    ...(sourceId !== undefined ? { sourceId } : {}),
    mode,
    json: flags.json === true,
    format: rawFormat,
  }
}
