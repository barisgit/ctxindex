import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type DescribeArgs =
  | {
      readonly kind: 'describe'
      readonly selector?: 'profile' | 'adapter' | 'action'
      readonly id?: string
      readonly format: 'text' | 'markdown' | 'json'
      readonly full: boolean
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export function parseDescribeArgs(args: string[]): DescribeArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const { flags, positional } = parseFlags(args, {
    booleanFlags: ['json', 'full'],
  })
  const unknownFlag = Object.keys(flags).find(
    (flag) => flag !== 'format' && flag !== 'json' && flag !== 'full',
  )
  if (unknownFlag)
    return {
      kind: 'unknown',
      message: `describe: unknown option --${unknownFlag}`,
    }
  if (flags.format === true)
    return { kind: 'unknown', message: 'describe: --format requires a value' }
  if (flags.json !== undefined && flags.json !== true)
    return {
      kind: 'unknown',
      message: 'describe: --json does not take a value',
    }
  if (flags.full !== undefined && flags.full !== true)
    return {
      kind: 'unknown',
      message: 'describe: --full does not take a value',
    }
  const selector = positional[0]
  if (
    selector !== undefined &&
    selector !== 'profile' &&
    selector !== 'adapter' &&
    selector !== 'action'
  ) {
    return {
      kind: 'unknown',
      message: `describe: unknown selector "${selector}"`,
    }
  }
  if (positional.length > 2)
    return { kind: 'unknown', message: 'describe: too many selectors' }
  if (positional[1] && flags.full === true)
    return {
      kind: 'unknown',
      message: 'describe: --full is redundant with an exact id',
    }
  const rawFormat = stringFlag(flags, 'format') ?? 'text'
  if (
    rawFormat !== 'text' &&
    rawFormat !== 'markdown' &&
    rawFormat !== 'json'
  ) {
    return {
      kind: 'unknown',
      message: `describe: invalid format "${rawFormat}"`,
    }
  }
  if (flags.json === true && rawFormat !== 'text' && rawFormat !== 'json') {
    return {
      kind: 'unknown',
      message: 'describe: --json conflicts with --format',
    }
  }
  const format = flags.json === true ? 'json' : rawFormat
  return {
    kind: 'describe',
    ...(selector ? { selector } : {}),
    ...(positional[1] ? { id: positional[1] } : {}),
    format,
    full: flags.full === true,
  }
}
