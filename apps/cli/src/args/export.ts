import { parseRef } from '@ctxindex/core'
import { hasHelpFlag } from './flags'

export type ExportArgs =
  | { readonly kind: 'export'; readonly ref: string; readonly format: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const exportUsage = 'export <ref> --format <f>'

export function parseExportArgs(args: string[]): ExportArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }

  const positional: string[] = []
  let format: string | undefined
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string
    if (arg === '--format' || arg.startsWith('--format=')) {
      if (format !== undefined) {
        return { kind: 'unknown', message: 'export: duplicate --format' }
      }
      const value =
        arg === '--format' ? args[index + 1] : arg.slice('--format='.length)
      if (value === undefined || value === '' || value.startsWith('--')) {
        return { kind: 'unknown', message: 'export: --format requires a value' }
      }
      format = value
      if (arg === '--format') index += 1
    } else if (arg.startsWith('-')) {
      return { kind: 'unknown', message: `export: unknown flag ${arg}` }
    } else {
      positional.push(arg)
    }
  }

  if (positional.length === 0) {
    return { kind: 'unknown', message: 'export: missing <ref>' }
  }
  if (positional.length !== 1) {
    return { kind: 'unknown', message: 'export: expected exactly one <ref>' }
  }
  const ref = positional[0] as string
  try {
    parseRef(ref)
  } catch {
    return { kind: 'unknown', message: `export: invalid <ref>: ${ref}` }
  }
  if (format === undefined) {
    return { kind: 'unknown', message: 'export: missing --format <f>' }
  }
  return { kind: 'export', ref, format }
}
