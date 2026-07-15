import { describe, expect, test } from 'bun:test'
import { sanitizeQuery } from './sanitize'

describe('sanitizeQuery', () => {
  test('produces exact and relaxed FTS expressions', () => {
    expect(sanitizeQuery('alpha beta')).toEqual({
      strict: '"alpha" "beta"',
      relaxed: '"alpha"* OR "beta"*',
    })
  })

  test('removes FTS operators and handles an empty query', () => {
    expect(sanitizeQuery('  [alpha]* OR (beta)!  ')).toEqual({
      strict: '"alpha" "OR" "beta"',
      relaxed: '"alpha"* OR "OR"* OR "beta"*',
    })
    expect(sanitizeQuery('***')).toEqual({ strict: '""', relaxed: '""' })
  })
})
