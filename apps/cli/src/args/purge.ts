import { hasHelpFlag } from './flags'

export type PurgeArtifactsArgs =
  | { readonly kind: 'purge'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const purgeArtifactsUsage = 'purge artifacts [--json]'

export function parsePurgeArtifactsArgs(args: string[]): PurgeArtifactsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  let json = false
  for (const arg of args) {
    if (arg === '--json') {
      if (json)
        return {
          kind: 'unknown',
          message: 'purge artifacts: --json may be specified once',
        }
      json = true
    } else if (arg.startsWith('-')) {
      return {
        kind: 'unknown',
        message: `purge artifacts: unknown flag ${arg}`,
      }
    } else {
      return {
        kind: 'unknown',
        message: `purge artifacts: unexpected argument ${arg}`,
      }
    }
  }
  return { kind: 'purge', json }
}
