import { describe, expect, test } from 'bun:test'
import { chunkText } from './chunker'

// Realistic ~5000-char document: distinct, varying content per region (unlike a
// single repeated character, whose equal-length overlapping windows are identical).
const variedText = Array.from(
  { length: 100 },
  (_, i) => `line ${i}: ${'lorem ipsum dolor sit amet '.repeat(2)}`,
).join('\n')

describe('chunkText', () => {
  test('empty or whitespace-only text yields no chunks', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n\t ')).toEqual([])
  })

  test('short text under the target size yields exactly one chunk', () => {
    const text = 'export function add(a,b){return a+b}\n// widget helper'
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ index: 0, content: text })
  })

  test('chunk indices are contiguous starting at 0', () => {
    const text = 'a'.repeat(5000)
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThan(1)
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i)
    })
  })

  test('long text splits into a bounded number of overlapping chunks', () => {
    const chunks = chunkText(variedText)
    // effective stride ~1300; ~5000 chars -> a handful of chunks, never per-character.
    expect(chunks.length).toBeLessThanOrEqual(6)
    expect(chunks.length).toBeGreaterThanOrEqual(3)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(3000)
    }
  })

  test('consecutive chunks overlap rather than duplicate', () => {
    const chunks = chunkText(variedText)
    // No two consecutive chunks are byte-identical (the over-chunking bug produced
    // thousands of near-identical chunks each shifted by one character).
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]?.content).not.toBe(chunks[i - 1]?.content)
    }
  })

  test('prefers a paragraph break over a hard split', () => {
    const head = 'A'.repeat(1400)
    const tail = 'B'.repeat(1400)
    const chunks = chunkText(`${head}\n\n${tail}`)
    // First chunk should end at the blank line, not mid-run.
    expect(chunks[0]?.content).toBe(head)
  })
})
