import type { SecretBackend } from '@ctxindex/core/secrets'

export function formatSecretsAlready(target: SecretBackend): string {
  return `secrets backend already ${target}`
}

export function formatSecretsMigrated(
  moved: number,
  target: SecretBackend,
): string {
  return `migrated ${moved} secret${moved === 1 ? '' : 's'} to ${target}`
}
