import type { SecretBackend } from '@ctxindex/core/secrets'
import { hasHelpFlag } from './flags'

export type SecretsArgs =
  | { readonly kind: 'status'; readonly json: boolean }
  | { readonly kind: 'set'; readonly target: SecretBackend }
  | { readonly kind: 'help' }
  | { readonly kind: 'unknown'; readonly message: string }

export const secretsUsage =
  'secrets status [--json] | secrets backend set <keychain|file>'

function unknown(): SecretsArgs {
  return { kind: 'unknown', message: `usage: ctxindex ${secretsUsage}` }
}

export function parseSecretsArgs(args: string[]): SecretsArgs {
  if (hasHelpFlag(args)) return { kind: 'help' }

  if (args[0] === 'status') {
    if (args.length === 1) return { kind: 'status', json: false }
    if (args.length === 2 && args[1] === '--json') {
      return { kind: 'status', json: true }
    }
    return unknown()
  }

  if (
    args.length === 3 &&
    args[0] === 'backend' &&
    args[1] === 'set' &&
    (args[2] === 'keychain' || args[2] === 'file')
  ) {
    return { kind: 'set', target: args[2] }
  }

  return unknown()
}
