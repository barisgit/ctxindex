import { hasHelpFlag, listFlag, parseFlags, stringFlag } from './flags'

export type AuthArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly adapterIds: readonly string[]
      readonly clientId?: string
      readonly label?: string
      readonly mode: 'loopback' | 'from-env'
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }
export const authUsage =
  'auth add <provider> --adapter <id>... (--loopback|--from-env) [--client-id <public-id>] [--label <label>]'
export function parseAuthArgs(args: string[]): AuthArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, provider, ...rest] = args
  if (subcommand !== 'add')
    return {
      kind: 'unknown',
      message: `auth: unknown subcommand "${subcommand ?? ''}"`,
    }
  if (!provider || provider.startsWith('-'))
    return { kind: 'unknown', message: 'auth add: missing <provider>' }
  const parsed = parseFlags(rest, { booleanFlags: ['loopback', 'from-env'] })
  if (parsed.positional.length > 0)
    return {
      kind: 'unknown',
      message: `auth add: unexpected argument "${parsed.positional[0]}"`,
    }
  for (const key of Object.keys(parsed.flags))
    if (
      !['adapter', 'loopback', 'from-env', 'client-id', 'label'].includes(key)
    )
      return { kind: 'unknown', message: `auth add: unknown option --${key}` }
  const adapterIds = listFlag(parsed.flags, 'adapter')
  if (adapterIds.length === 0)
    return {
      kind: 'unknown',
      message: 'auth add: at least one --adapter <id> is required',
    }
  const modes = [
    parsed.flags.loopback === true,
    parsed.flags['from-env'] === true,
  ].filter(Boolean).length
  if (modes !== 1)
    return {
      kind: 'unknown',
      message: 'auth add: choose exactly one of --loopback or --from-env',
    }
  const clientId = stringFlag(parsed.flags, 'client-id')
  const label = stringFlag(parsed.flags, 'label')
  if (parsed.flags['client-id'] !== undefined && !clientId)
    return {
      kind: 'unknown',
      message: 'auth add: --client-id requires a value',
    }
  if (parsed.flags.label !== undefined && !label)
    return { kind: 'unknown', message: 'auth add: --label requires a value' }
  return {
    kind: 'add',
    provider,
    adapterIds,
    ...(clientId ? { clientId } : {}),
    ...(label ? { label } : {}),
    mode: parsed.flags.loopback === true ? 'loopback' : 'from-env',
  }
}
