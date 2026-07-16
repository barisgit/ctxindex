export type FlagValue = boolean | string | readonly string[]

export type ParseFlagsError =
  | { readonly kind: 'unknown'; readonly flag: string }
  | { readonly kind: 'duplicate'; readonly flag: string }
  | { readonly kind: 'missing-value'; readonly flag: string }

export interface ParsedFlags {
  readonly flags: Record<string, FlagValue>
  readonly positional: string[]
  readonly error?: ParseFlagsError
}

export interface ParseFlagsOptions {
  readonly booleanFlags?: readonly string[]
  readonly valueFlags?: readonly string[]
  readonly strict?: boolean
}

function isNegativeNumericValue(value: string): boolean {
  return /^-(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)
}

function addFlag(
  flags: Record<string, FlagValue>,
  key: string,
  value: string,
): void {
  const existing = flags[key]
  if (existing === undefined || existing === true) flags[key] = value
  else if (typeof existing === 'string') flags[key] = [existing, value]
  else if (Array.isArray(existing)) flags[key] = [...existing, value]
  else flags[key] = value
}

export function parseFlags(
  args: string[],
  options: ParseFlagsOptions = {},
): ParsedFlags {
  const flags: Record<string, FlagValue> = {}
  const positional: string[] = []
  const booleanFlags = new Set(options.booleanFlags ?? [])
  const valueFlags = new Set(options.valueFlags ?? [])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=')
      if (options.strict) {
        const key = arg.slice(2, equalsIndex === -1 ? undefined : equalsIndex)
        const flag = `--${key}`
        if (valueFlags.has(key)) {
          if (key in flags)
            return {
              flags,
              positional,
              error: { kind: 'duplicate', flag },
            }
          const value =
            equalsIndex === -1 ? args[index + 1] : arg.slice(equalsIndex + 1)
          if (
            value === undefined ||
            value.length === 0 ||
            value.startsWith('--')
          ) {
            return {
              flags,
              positional,
              error: { kind: 'missing-value', flag },
            }
          }
          flags[key] = value
          if (equalsIndex === -1) index += 1
          continue
        }
        if (booleanFlags.has(key) && equalsIndex === -1) {
          flags[key] = true
          continue
        }
        return {
          flags,
          positional,
          error: { kind: 'unknown', flag },
        }
      }
      if (equalsIndex > 2) {
        addFlag(flags, arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1))
        continue
      }
      const key = arg.slice(2)
      const next = args[index + 1]
      if (
        !booleanFlags.has(key) &&
        next !== undefined &&
        (!next.startsWith('-') ||
          (valueFlags.has(key) && isNegativeNumericValue(next)))
      ) {
        addFlag(flags, key, next)
        index += 1
      } else {
        flags[key] = true
      }
    } else {
      if (options.strict && arg.startsWith('-')) {
        return {
          flags,
          positional,
          error: { kind: 'unknown', flag: arg },
        }
      }
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
  if (typeof value === 'string') return value
  return Array.isArray(value) ? value.at(-1) : undefined
}

export function listFlag(
  flags: Record<string, FlagValue>,
  key: string,
): readonly string[] {
  const value = flags[key]
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value : []
}
