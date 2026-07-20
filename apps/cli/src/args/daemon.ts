import { hasHelpFlag, parseFlags } from './flags'

export type DaemonArgs =
  | { readonly kind: 'serve' }
  | { readonly kind: 'health'; readonly json: boolean }
  | { readonly kind: 'shutdown'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const daemonUsage = 'daemon <serve|health|shutdown> [--json]'

export function parseDaemonArgs(args: string[]): DaemonArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const command = args[0]
  if (command !== 'serve' && command !== 'health' && command !== 'shutdown') {
    return {
      kind: 'unknown',
      message: 'daemon: expected serve, health, or shutdown',
    }
  }
  const rest = args.slice(1)
  const { flags, positional, error } = parseFlags(rest, {
    booleanFlags: command === 'serve' ? [] : ['json'],
    strict: true,
  })
  if (error) {
    const detail =
      error.kind === 'unknown'
        ? `unknown flag ${error.flag}`
        : error.kind === 'duplicate'
          ? `duplicate ${error.flag}`
          : `${error.flag} requires a non-empty value`
    return { kind: 'unknown', message: `daemon ${command}: ${detail}` }
  }
  if (positional.length > 0) {
    return {
      kind: 'unknown',
      message: `daemon ${command}: unexpected argument: ${positional[0]}`,
    }
  }
  if (rest.filter((arg) => arg === '--json').length > 1) {
    return {
      kind: 'unknown',
      message: `daemon ${command}: duplicate --json`,
    }
  }
  if (command === 'serve') return { kind: 'serve' }
  return { kind: command, json: flags.json === true }
}
