import { expect, test } from 'bun:test'
import type {
  SecretBackendStatus,
  SecretBackendSwitchResult,
} from '@ctxindex/core/secrets'
import { formatSecretBackendStatus, formatSecretBackendSwitch } from './secrets'

const status: SecretBackendStatus = {
  backend: 'file',
  backends: {
    file: { available: true, referenceCount: 2 },
    keychain: { available: false, referenceCount: 1 },
  },
}

test('formats deterministic non-sensitive backend status', () => {
  expect(formatSecretBackendStatus(status, false)).toBe(
    [
      'backend: file',
      'file: available (2 references)',
      'keychain: unavailable (1 reference)',
    ].join('\n'),
  )
  expect(JSON.parse(formatSecretBackendStatus(status, true))).toEqual(status)
})

test('formats switch result without secret identifiers', () => {
  const result: SecretBackendSwitchResult = {
    backend: 'keychain',
    copied: 2,
    cleaned: 1,
    cleanupPending: true,
    warnings: ['1 source secret copy could not be cleaned up'],
  }
  expect(formatSecretBackendSwitch(result)).toBe(
    'secrets backend set to keychain; copied 2; cleaned 1; cleanup pending',
  )
})
