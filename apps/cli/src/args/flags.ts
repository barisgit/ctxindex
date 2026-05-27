export type FlagValue = boolean | string

export interface ParsedFlags {
  readonly flags: Record<string, FlagValue>
  readonly positional: string[]
}

export function parseFlags(args: string[]): ParsedFlags {
  const flags: Record<string, FlagValue> = {}
  const positional: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=')
      if (equalsIndex > 2) {
        flags[arg.slice(2, equalsIndex)] = arg.slice(equalsIndex + 1)
        continue
      }
      const key = arg.slice(2)
      const next = args[index + 1]
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next
        index += 1
      } else {
        flags[key] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

export function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h')
}

export function stringFlag(
  flags: Record<string, FlagValue>,
  key: string,
): string | undefined {
  const value = flags[key]
  return typeof value === 'string' ? value : undefined
}
