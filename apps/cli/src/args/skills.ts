import { hasHelpFlag, parseFlags } from './flags'

export type SkillsArgs =
  | { readonly kind: 'list'; readonly json: boolean }
  | {
      readonly kind: 'get'
      readonly name: string
      readonly inline: boolean
      readonly json: boolean
    }
  | { readonly kind: 'path' }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const skillsUsage =
  'skills list [--json] | skills get <name> [--inline] [--json] | skills path'

export function parseSkillsArgs(args: string[]): SkillsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  const { flags, positional } = parseFlags(rest)
  if (subcommand === 'list') return { kind: 'list', json: flags.json === true }
  if (subcommand === 'get') {
    const name = positional[0]
    return name
      ? {
          kind: 'get',
          name,
          inline: flags.inline === true,
          json: flags.json === true,
        }
      : { kind: 'unknown', message: 'skills get: missing skill name' }
  }
  if (subcommand === 'path') return { kind: 'path' }
  return {
    kind: 'unknown',
    message: `skills: unknown subcommand "${subcommand ?? ''}"`,
  }
}
