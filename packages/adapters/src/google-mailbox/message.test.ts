import { describe, expect, test } from 'bun:test'
import {
  gmailHeaderAddresses,
  normalizeGmailMessageId,
  normalizeGmailReferences,
} from './message'

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

test('normalizes ordered Reply-To addresses and RFC References', () => {
  expect(
    gmailHeaderAddresses(
      '"Reply, Person" <reply@example.com>, second@example.com',
    ),
  ).toEqual(['"Reply, Person" <reply@example.com>', 'second@example.com'])
  expect(
    normalizeGmailReferences(
      '<root@example.com> <parent@example.com> <parent@example.com>',
    ),
  ).toEqual(['<root@example.com>', '<parent@example.com>'])
})

test('splits Gmail addresses after a quote preceded by an even backslash run', () => {
  expect(
    gmailHeaderAddresses(
      String.raw`"Backslash \\" <first@example.com>, second@example.com`,
    ),
  ).toEqual([
    String.raw`"Backslash \\" <first@example.com>`,
    'second@example.com',
  ])
})
