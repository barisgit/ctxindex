import { hasHelpFlag, parseFlags, stringFlag } from './flags'

export type AuthArgs =
  | {
      readonly kind: 'add'
      readonly provider: string
      readonly clientId?: string
      readonly clientSecret?: string
      readonly authCode?: string
      readonly refreshToken?: string
      readonly label?: string
      readonly loopback: boolean
      readonly fromEnv: boolean
    }
  | { readonly kind: 'list'; readonly json: boolean }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const authUsage =
  'auth add google (--from-env | --client-id <id> --client-secret <secret> [--auth-code <code> | --refresh-token <token> | --loopback]) | auth list [--json]'

export function parseAuthArgs(args: string[]): AuthArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, ...rest] = args
  if (subcommand === 'list') {
    const { flags } = parseFlags(rest)
    return { kind: 'list', json: flags.json === true }
  }
  if (subcommand !== 'add') {
    return {
      kind: 'unknown',
      message: `auth: unknown subcommand "${subcommand ?? ''}"`,
    }
  }
  const [provider, ...flagArgs] = rest
  if (!provider)
    return { kind: 'unknown', message: 'auth add: missing <provider>' }
  const { flags } = parseFlags(flagArgs)
  for (const key of Object.keys(flags)) {
    if (
      key !== 'client-id' &&
      key !== 'client-secret' &&
      key !== 'auth-code' &&
      key !== 'refresh-token' &&
      key !== 'label' &&
      key !== 'loopback' &&
      key !== 'from-env'
    ) {
      return { kind: 'unknown', message: `auth add: unknown option --${key}` }
    }
  }
  const clientId = stringFlag(flags, 'client-id')
  const clientSecret = stringFlag(flags, 'client-secret')
  const authCode = stringFlag(flags, 'auth-code')
  const refreshToken = stringFlag(flags, 'refresh-token')
  const label = stringFlag(flags, 'label')
  const directFlowCount = [
    authCode !== undefined,
    refreshToken !== undefined,
    flags.loopback === true,
  ].filter(Boolean).length
  if (directFlowCount > 1) {
    return {
      kind: 'unknown',
      message:
        'auth add google: choose only one of --auth-code, --refresh-token, or --loopback',
    }
  }
  return {
    kind: 'add',
    provider,
    ...(clientId !== undefined ? { clientId } : {}),
    ...(clientSecret !== undefined ? { clientSecret } : {}),
    ...(authCode !== undefined ? { authCode } : {}),
    ...(refreshToken !== undefined ? { refreshToken } : {}),
    ...(label !== undefined ? { label } : {}),
    loopback: flags.loopback === true,
    fromEnv: flags['from-env'] === true,
  }
}
