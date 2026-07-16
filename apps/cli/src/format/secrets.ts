import type {
  SecretBackendStatus,
  SecretBackendSwitchResult,
} from '@ctxindex/core/secrets'

function references(count: number): string {
  return `${count} reference${count === 1 ? '' : 's'}`
}

export function formatSecretBackendStatus(
  status: SecretBackendStatus,
  json: boolean,
): string {
  if (json) return JSON.stringify(status, null, 2)
  return [
    `backend: ${status.backend}`,
    `file: ${status.backends.file.available ? 'available' : 'unavailable'} (${references(status.backends.file.referenceCount)})`,
    `keychain: ${status.backends.keychain.available ? 'available' : 'unavailable'} (${references(status.backends.keychain.referenceCount)})`,
  ].join('\n')
}

export function formatSecretBackendSwitch(
  result: SecretBackendSwitchResult,
): string {
  return [
    `secrets backend set to ${result.backend}`,
    `copied ${result.copied}`,
    `cleaned ${result.cleaned}`,
    ...(result.cleanupPending ? ['cleanup pending'] : []),
  ].join('; ')
}
