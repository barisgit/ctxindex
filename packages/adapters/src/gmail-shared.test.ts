import { describe, expect, test } from 'bun:test'
import { normalizeGmailMessageId } from './gmail-shared'

describe('normalizeGmailMessageId', () => {
  test('trims and prefers the first angle-bracket Message-ID token', () => {
    expect(
      normalizeGmailMessageId(
        ' noise <first@example.com> ignored <second@example.com> ',
      ),
    ).toBe('<first@example.com>')
  })

  test('falls back to trimmed nonempty text and omits empty values', () => {
    expect(normalizeGmailMessageId('  opaque-message-id  ')).toBe(
      'opaque-message-id',
    )
    expect(normalizeGmailMessageId('  ')).toBeUndefined()
    expect(normalizeGmailMessageId(undefined)).toBeUndefined()
  })
})
