import { describe, expect, test } from 'bun:test'
import { chunkText } from './index'

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
    expect(chunkText(text)).toEqual([{ index: 0, content: text }])
  })

  test('long text produces bounded, overlapping, contiguous chunks', () => {
    const chunks = chunkText(variedText)

    expect(chunks.length).toBeGreaterThanOrEqual(3)
    expect(chunks.length).toBeLessThanOrEqual(6)
    for (const [index, chunk] of chunks.entries()) {
      expect(chunk.index).toBe(index)
      expect(chunk.content.length).toBeLessThanOrEqual(3000)
      if (index > 0) expect(chunk.content).not.toBe(chunks[index - 1]?.content)
    }
  })

  test('prefers a paragraph break over a hard split', () => {
    const head = 'A'.repeat(1400)
    const tail = 'B'.repeat(1400)

    expect(chunkText(`${head}\n\n${tail}`)[0]?.content).toBe(head)
  })
})
