import type { SyncMode } from '@ctxindex/core/registry'
import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type SyncArgs =
  | {
      readonly kind: 'run'
      readonly sourceId?: string
      readonly mode: SyncMode
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const syncUsage =
  'sync [--source <id>] [--mode sync|resync|diff] [--json]'

function parseMode(value: string | undefined): SyncMode | null {
  if (value === undefined) return 'sync'
  if (value === 'sync' || value === 'resync' || value === 'diff') return value
  return null
}

export function parseSyncArgs(args: string[]): SyncArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags } = parseFlags(args)
  const mode = parseMode(stringFlag(flags, 'mode'))
  if (!mode) {
    return {
      kind: 'unknown',
      message: 'sync: --mode must be sync, resync, or diff',
    }
  }
  const sourceId = stringFlag(flags, 'source')
  return {
    kind: 'run',
    ...(sourceId !== undefined ? { sourceId } : {}),
    mode,
    json: flags.json === true,
  }
}
