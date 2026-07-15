import { parseRef } from '@ctxindex/core'
import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type ArtifactListArgs =
  | { readonly kind: 'list'; readonly ref: string; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export type ArtifactDownloadArgs =
  | {
      readonly kind: 'download'
      readonly ref: string
      readonly outputPath?: string | undefined
      readonly json: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const artifactListUsage = 'artifact list <ref> [--json]'
export const artifactDownloadUsage =
  'artifact download <artifact-ref> [--output <path>] [--json]'

function invalidRef(
  command: string,
  ref: string,
): { kind: 'unknown'; message: string } | undefined {
  try {
    parseRef(ref)
  } catch {
    return { kind: 'unknown', message: `${command}: invalid <ref>: ${ref}` }
  }
}

export function parseArtifactListArgs(args: string[]): ArtifactListArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, { booleanFlags: ['json'] })
  const unknown = Object.keys(flags).find((flag) => flag !== 'json')
  if (unknown)
    return {
      kind: 'unknown',
      message: `artifact list: unknown flag --${unknown}`,
    }
  if (positional.length === 0)
    return { kind: 'unknown', message: 'artifact list: missing <ref>' }
  if (positional.length !== 1)
    return {
      kind: 'unknown',
      message: 'artifact list: expected exactly one <ref>',
    }
  const ref = positional[0] as string
  return (
    invalidRef('artifact list', ref) ?? {
      kind: 'list',
      ref,
      json: flags.json === true,
    }
  )
}

export function parseArtifactDownloadArgs(
  args: string[],
): ArtifactDownloadArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, { booleanFlags: ['json'] })
  const unknown = Object.keys(flags).find(
    (flag) => flag !== 'json' && flag !== 'output',
  )
  if (unknown)
    return {
      kind: 'unknown',
      message: `artifact download: unknown flag --${unknown}`,
    }
  if (flags.output === true)
    return {
      kind: 'unknown',
      message: 'artifact download: --output requires a path',
    }
  if (positional.length === 0)
    return {
      kind: 'unknown',
      message: 'artifact download: missing <artifact-ref>',
    }
  if (positional.length !== 1)
    return {
      kind: 'unknown',
      message: 'artifact download: expected exactly one <artifact-ref>',
    }
  const ref = positional[0] as string
  const invalid = invalidRef('artifact download', ref)
  if (invalid) return invalid
  const outputPath = stringFlag(flags, 'output')
  return {
    kind: 'download',
    ref,
    ...(outputPath === undefined ? {} : { outputPath }),
    json: flags.json === true,
  }
}
