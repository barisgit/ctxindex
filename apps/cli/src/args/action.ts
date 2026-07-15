export type ActionArgs =
  | {
      readonly kind: 'describe'
      readonly actionId: string
      readonly sourceId?: string
      readonly json: boolean
    }
  | {
      readonly kind: 'run'
      readonly actionId: string
      readonly sourceId: string
      readonly input: string
      readonly json: boolean
      readonly confirmIrreversible: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const actionDescribeUsage =
  'action describe <action-id> [--source <id>] [--json]'
export const actionRunUsage =
  'action run <action-id> --source <id> --input <json-or-file> [--json] [--confirm-irreversible]'

interface ParsedActionFlags {
  readonly positional: string[]
  readonly values: Record<string, string>
  readonly booleans: Set<string>
  readonly error?: string
}

function parseSubcommandFlags(
  command: 'describe' | 'run',
  args: string[],
): ParsedActionFlags {
  const valueFlags = new Set(
    command === 'describe' ? ['source'] : ['source', 'input'],
  )
  const booleanFlags = new Set(
    command === 'describe' ? ['json'] : ['json', 'confirm-irreversible'],
  )
  const positional: string[] = []
  const values: Record<string, string> = {}
  const booleans = new Set<string>()

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === undefined) continue
    if (!arg.startsWith('--')) {
      if (arg.startsWith('-')) {
        return {
          positional,
          values,
          booleans,
          error: `action ${command}: unknown flag ${arg}`,
        }
      }
      positional.push(arg)
      continue
    }
    const equals = arg.indexOf('=')
    const key = arg.slice(2, equals === -1 ? undefined : equals)
    if (valueFlags.has(key)) {
      if (key in values) {
        return {
          positional,
          values,
          booleans,
          error: `action ${command}: duplicate --${key}`,
        }
      }
      const value = equals === -1 ? args[++index] : arg.slice(equals + 1)
      if (value === undefined || value.length === 0 || value.startsWith('--')) {
        return {
          positional,
          values,
          booleans,
          error: `action ${command}: --${key} requires a non-empty value`,
        }
      }
      values[key] = value
      continue
    }
    if (booleanFlags.has(key) && equals === -1) {
      booleans.add(key)
      continue
    }
    return {
      positional,
      values,
      booleans,
      error: `action ${command}: unknown flag --${key}`,
    }
  }
  return { positional, values, booleans }
}

export function parseActionArgs(args: string[]): ActionArgs {
  if (args.includes('--help') || args.includes('-h')) return { kind: 'help' }
  const command = args[0]
  if (command === undefined) {
    return { kind: 'unknown', message: 'action: missing describe or run' }
  }
  if (command !== 'describe' && command !== 'run') {
    return {
      kind: 'unknown',
      message: `action: unknown subcommand: ${command}`,
    }
  }

  const parsed = parseSubcommandFlags(command, args.slice(1))
  if (parsed.error) return { kind: 'unknown', message: parsed.error }
  if (parsed.positional.length === 0) {
    return {
      kind: 'unknown',
      message: `action ${command}: missing <action-id>`,
    }
  }
  if (parsed.positional.length !== 1) {
    return {
      kind: 'unknown',
      message: `action ${command}: expected exactly one <action-id>`,
    }
  }
  const actionId = parsed.positional[0] as string
  const sourceId = parsed.values.source
  if (command === 'describe') {
    return {
      kind: 'describe',
      actionId,
      ...(sourceId === undefined ? {} : { sourceId }),
      json: parsed.booleans.has('json'),
    }
  }
  if (sourceId === undefined) {
    return { kind: 'unknown', message: 'action run: missing --source' }
  }
  const input = parsed.values.input
  if (input === undefined) {
    return { kind: 'unknown', message: 'action run: missing --input' }
  }
  return {
    kind: 'run',
    actionId,
    sourceId,
    input,
    json: parsed.booleans.has('json'),
    confirmIrreversible: parsed.booleans.has('confirm-irreversible'),
  }
}
