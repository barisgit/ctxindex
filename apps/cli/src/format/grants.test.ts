import { describe, expect, test } from 'bun:test'
import { formatGrantAdded, formatGrants, type GrantSummary } from './grants'

const FIXED_NOW = Date.UTC(2026, 0, 15, 12, 0, 0) // 2026-01-15T12:00:00Z

function grant(overrides: Partial<GrantSummary> = {}): GrantSummary {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    provider: 'google',
    scopes: '["https://www.googleapis.com/auth/gmail.readonly"]',
    expiresAt: null,
    accountEmail: 'me@example.com',
    accountDisplayName: 'me@example.com',
    ...overrides,
  }
}

describe('formatGrants', () => {
  test('json output is stable and parseable', () => {
    const rows: GrantSummary[] = [
      grant({ id: 'g1' }),
      grant({
        id: 'g2',
        scopes: 'scope-one scope-two',
        expiresAt: FIXED_NOW + 3600_000,
      }),
    ]

    const out = formatGrants(rows, { json: true })

    expect(JSON.parse(out)).toEqual(rows)
  })

  test('json output is [] for empty input', () => {
    expect(formatGrants([], { json: true })).toBe('[]')
  })

  test('empty state is clear and points to add command', () => {
    const out = formatGrants([], { json: false, now: FIXED_NOW })

    expect(out).toContain('No OAuth grants')
    expect(out).toContain('ctxindex auth add google')
  })

  test('renders label, provider, id, scopes, and expiry for a labelled grant', () => {
    const out = formatGrants(
      [
        grant({
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          expiresAt: FIXED_NOW + 3600_000,
        }),
      ],
      { json: false, now: FIXED_NOW },
    )

    expect(out).toContain('me@example.com')
    expect(out).toContain('google')
    expect(out).toContain('01ARZ3NDEKTSV4RRFFQ69G5FAV')
    // Scope prefix is stripped to the short name for compactness.
    expect(out).toContain('gmail.readonly')
    // Future expiry is rendered as a UTC timestamp.
    expect(out).toMatch(/2026-01-15 13:00/)
  })

  test('display name is shown as label when email is absent', () => {
    const out = formatGrants(
      [grant({ accountEmail: null, accountDisplayName: 'Work Gmail' })],
      { json: false, now: FIXED_NOW },
    )

    expect(out).toContain('Work Gmail')
  })

  test('placeholder google account is not shown as a label column', () => {
    const out = formatGrants(
      [grant({ accountEmail: 'google', accountDisplayName: 'google' })],
      { json: false, now: FIXED_NOW },
    )

    expect(out).not.toContain('Label')
    expect(out).not.toContain('Account')
    expect(out).toContain('Provider')
    expect(out).toContain('gmail.readonly')
  })

  test('multiple scopes are shown comma-separated', () => {
    const out = formatGrants(
      [
        grant({
          scopes: JSON.stringify([
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
          ]),
        }),
      ],
      { json: false, now: FIXED_NOW },
    )

    expect(out).toContain('gmail.readonly, gmail.send')
  })

  test('space-separated scope string is parsed', () => {
    const out = formatGrants([grant({ scopes: 'scope-one scope-two' })], {
      json: false,
      now: FIXED_NOW,
    })

    expect(out).toContain('scope-one, scope-two')
  })

  test('expired token is labelled, not timestamped', () => {
    const out = formatGrants([grant({ expiresAt: FIXED_NOW - 1 })], {
      json: false,
      now: FIXED_NOW,
    })

    expect(out).toContain('expired')
    expect(out).not.toContain('2026')
  })

  test('null expiry renders as "no expiry"', () => {
    const out = formatGrants([grant({ expiresAt: null })], {
      json: false,
      now: FIXED_NOW,
    })

    expect(out).toContain('no expiry')
  })

  test('non-Google scope is preserved in full', () => {
    const out = formatGrants([grant({ scopes: 'custom:scope' })], {
      json: false,
      now: FIXED_NOW,
    })

    expect(out).toContain('custom:scope')
  })

  test('malformed scope JSON falls back to whitespace split', () => {
    const out = formatGrants([grant({ scopes: '["unterminated scope-two' })], {
      json: false,
      now: FIXED_NOW,
    })

    // The exact splitting depends on the malformed string, but the formatter
    // must not throw and must still surface the scopes.
    expect(out).toMatch(/scope/)
  })

  test('multiple grants are listed', () => {
    const out = formatGrants(
      [
        grant({ id: 'g1' }),
        grant({ id: 'g2', scopes: '["x"]', expiresAt: FIXED_NOW + 60_000 }),
      ],
      { json: false, now: FIXED_NOW },
    )

    expect(out).toContain('g1')
    expect(out).toContain('g2')
    expect(out).toContain('x')
  })
})

describe('formatGrantAdded', () => {
  test('labels the grant', () => {
    expect(formatGrantAdded('abc')).toBe('auth grant added: abc')
  })
})
