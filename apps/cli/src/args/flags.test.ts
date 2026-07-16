import { describe, expect, test } from 'bun:test'
import { listFlag, parseFlags, stringFlag } from './flags'

describe('shared CLI flags', () => {
  test('keeps all values while stringFlag remains last-value deterministic', () => {
    const { flags } = parseFlags(['--field', 'sender=a', '--field=unread=true'])
    expect(listFlag(flags, 'field')).toEqual(['sender=a', 'unread=true'])
    expect(stringFlag(flags, 'field')).toBe('unread=true')
  })

  test('does not consume a following long flag as a value flag value', () => {
    expect(
      parseFlags(['--count', '--json'], {
        valueFlags: ['count'],
        booleanFlags: ['json'],
      }),
    ).toEqual({ flags: { count: true, json: true }, positional: [] })
    expect(
      parseFlags(['--count', '-2'], { valueFlags: ['count'] }).flags.count,
    ).toBe('-2')
    expect(
      parseFlags(['--ratio', '-.5'], { valueFlags: ['ratio'] }).flags.ratio,
    ).toBe('-.5')
  })

  test('preserves degenerate non-strict flag keys', () => {
    expect(parseFlags(['--=value']).flags).toEqual({ '=value': true })
    expect(parseFlags(['--=']).flags).toEqual({ '=': true })
  })
})
