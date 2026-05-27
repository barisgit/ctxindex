import type { SecretBackend } from '@ctxindex/core/secrets'
import { hasHelpFlag } from './flags'

export type SecretsArgs =
  | {
      readonly kind: 'migrate'
      readonly target: SecretBackend
      readonly passphrase?: string
    }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const secretsUsage =
  'secrets migrate <keychain|file> [--passphrase <passphrase>]'

export function parseSecretsArgs(args: string[]): SecretsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }
  const [subcommand, target, ...rest] = args
  if (
    subcommand !== 'migrate' ||
    (target !== 'keychain' && target !== 'file')
  ) {
    return {
      kind: 'unknown',
      message:
        'usage: ctxindex secrets migrate <keychain|file> [--passphrase <passphrase>]',
    }
  }
  let passphrase: string | undefined
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === '--passphrase') {
      const value = rest[index + 1]
      if (!value)
        return { kind: 'unknown', message: '--passphrase requires a value' }
      passphrase = value
      index += 1
    } else if (arg?.startsWith('--passphrase=')) {
      passphrase = arg.slice('--passphrase='.length)
    } else {
      return { kind: 'unknown', message: `unknown option: ${arg}` }
    }
  }
  return passphrase === undefined
    ? { kind: 'migrate', target }
    : { kind: 'migrate', target, passphrase }
}
