import { hasHelpFlag, parseFlags } from './flags'

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

export function parseActionArgs(args: string[]): ActionArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const command = args[0]
  if (command !== 'describe' && command !== 'run') {
    return {
      kind: 'unknown',
      message: command
        ? `action: unknown subcommand: ${command}`
        : 'action: missing describe or run',
    }
  }

  const { flags, positional, error } = parseFlags(args.slice(1), {
    booleanFlags:
      command === 'describe' ? ['json'] : ['json', 'confirm-irreversible'],
    valueFlags: command === 'describe' ? ['source'] : ['source', 'input'],
    strict: true,
  })
  if (error) {
    const detail =
      error.kind === 'unknown'
        ? `unknown flag ${error.flag}`
        : error.kind === 'duplicate'
          ? `duplicate ${error.flag}`
          : `${error.flag} requires a non-empty value`
    return { kind: 'unknown', message: `action ${command}: ${detail}` }
  }
  if (positional.length === 0) {
    return {
      kind: 'unknown',
      message: `action ${command}: missing <action-id>`,
    }
  }
  if (positional.length !== 1) {
    return {
      kind: 'unknown',
      message: `action ${command}: expected exactly one <action-id>`,
    }
  }
  const actionId = positional[0] as string
  const sourceId = flags.source as string | undefined
  if (command === 'describe') {
    return {
      kind: 'describe',
      actionId,
      ...(sourceId === undefined ? {} : { sourceId }),
      json: flags.json === true,
    }
  }
  if (sourceId === undefined) {
    return { kind: 'unknown', message: 'action run: missing --source' }
  }
  const input = flags.input as string | undefined
  if (input === undefined) {
    return { kind: 'unknown', message: 'action run: missing --input' }
  }
  return {
    kind: 'run',
    actionId,
    sourceId,
    input,
    json: flags.json === true,
    confirmIrreversible: flags['confirm-irreversible'] === true,
  }
}
