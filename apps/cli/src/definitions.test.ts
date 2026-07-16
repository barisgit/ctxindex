import { describe, expect, test } from 'bun:test'
import { redactExtensionDiagnostic } from './definitions'

describe('extension diagnostic redaction', () => {
  test.each([
    ['{"Authorization":"Bearer auth-secret"}', 'auth-secret'],
    ['Authorization=Bearer assignment-secret', 'assignment-secret'],
    ['request failed with Bearer bare-secret', 'bare-secret'],
    ['{"access_token":"access-secret"}', 'access-secret'],
    ['refresh-token=refresh-secret', 'refresh-secret'],
    ['client_secret: client-secret-value', 'client-secret-value'],
    ['password="password-secret"', 'password-secret'],
    ['api-key=api-secret', 'api-secret'],
    ['clientSecret=camel-secret', 'camel-secret'],
    ['apiKey=camel-api-secret', 'camel-api-secret'],
  ])('redacts %s', (message, secret) => {
    const redacted = redactExtensionDiagnostic(message)
    expect(redacted).toContain('[Redacted]')
    expect(redacted).not.toContain(secret)
  })

  test('redacts the configured canary while retaining useful path context', () => {
    const message = '/tmp/password-extension.ts: failed with canary-value'
    expect(redactExtensionDiagnostic(message, 'canary-value')).toBe(
      '/tmp/password-extension.ts: failed with [Redacted]',
    )
  })
})
