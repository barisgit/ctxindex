/**
 * Sanitize a user query string for use in SQLite FTS5 MATCH expressions.
 * Strips characters that break the parser, escapes double-quotes,
 * and produces a strict phrase-OR-term query.
 *
 * Falls back to a relaxed prefix query when the strict form would be empty.
 */
export function sanitizeQuery(raw: string): {
  strict: string
  relaxed: string
} {
  // Strip FTS5 special operators / punctuation that break the parser
  // Keep alphanumeric, spaces, hyphens, apostrophes
  const cleaned = raw
    .replace(/[()[\]{}^*?!~"]/g, ' ') // FTS5 operators
    .replace(/\s+/g, ' ')
    .trim()

  const terms = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (terms.length === 0) {
    return { strict: '""', relaxed: '""' }
  }

  // Strict: AND of exact terms (default FTS5 behaviour)
  const strict = terms.map((t) => JSON.stringify(t)).join(' ')

  // Relaxed: prefix-match each term with OR
  const relaxed = terms.map((t) => `${JSON.stringify(t)}*`).join(' OR ')

  return { strict, relaxed }
}
