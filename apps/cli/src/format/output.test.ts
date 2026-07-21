import { describe, expect, test } from 'bun:test'
import {
  escapeTsv,
  formatPrettyCollection,
  formatTsv,
  resolveOutputFormat,
  wrapDisplayText,
} from './output'

function cardValue(output: string, label: string): string {
  const chunks: string[] = []
  let collecting = false
  for (const line of output.split('\n')) {
    const cells = line.split('│')
    if (cells.length !== 4) continue
    const currentLabel = cells[1]?.trim()
    if (currentLabel === label) collecting = true
    else if (currentLabel) collecting = false
    if (collecting) chunks.push(cells[2]?.trim() ?? '')
  }
  return chunks.join('')
}

describe('structured output selection', () => {
  test('resolves explicit modes and destination-aware defaults', () => {
    expect(resolveOutputFormat({ format: 'pretty' }, { isTTY: false })).toBe(
      'pretty',
    )
    expect(resolveOutputFormat({ format: 'json' }, { isTTY: true })).toBe(
      'json',
    )
    expect(resolveOutputFormat({}, { isTTY: true })).toBe('pretty')
    expect(resolveOutputFormat({}, { isTTY: false })).toBe('text')
  })
})

test('escaped TSV keeps each logical row on one physical line', () => {
  expect(
    formatTsv(
      [
        { key: 'ref', label: 'Ref' },
        { key: 'title', label: 'Title' },
      ],
      [{ ref: 'ctx://source/a\\b', title: 'one\ttwo\nthree\rfour' }],
    ),
  ).toBe('ref\ttitle\nctx://source/a\\\\b\tone\\ttwo\\nthree\\rfour')
})

test('TSV null is distinct from literal sentinel-like and escaped strings', () => {
  const encoded = [null, '-', 'null', String.raw`\N`, String.raw`a\b`, ''].map(
    escapeTsv,
  )
  expect(encoded).toEqual([
    String.raw`\N`,
    '-',
    'null',
    String.raw`\\N`,
    String.raw`a\\b`,
    '',
  ])
  expect(new Set(encoded).size).toBe(encoded.length)
})

test('narrow pretty collections use vertical cards without truncating refs', () => {
  const ref = `ctx://source/message/${'immutable-id'.repeat(20)}`
  const output = formatPrettyCollection(
    [
      { key: 'ref', label: 'Ref' },
      { key: 'title', label: 'Title' },
    ],
    [{ ref, title: 'FedEx delivery' }],
    { columns: 40 },
  )
  expect(output.split('\n').every((line) => Bun.stringWidth(line) <= 40)).toBe(
    true,
  )
  expect(cardValue(output, 'Ref')).toBe(ref)
  expect(output).toContain('Ref')
  expect(output).not.toContain('…')
  expect(output).not.toContain('...')
})

test('narrow cards preserve wide Unicode below and above table width', () => {
  for (const [value, reconstructTable] of [
    ['abc def  ghi 末尾', false],
    ['xx👨‍👩‍👧‍👦yy', true],
    ['xx🇸🇮yy', true],
  ] as const) {
    const wrapped = wrapDisplayText(value, 4)
    expect(
      wrapped.split('\n').every((line) => Bun.stringWidth(line) <= 4),
    ).toBe(true)
    expect(wrapped.replaceAll('\n', '')).toBe(value)

    for (const columns of [8, 12]) {
      const output = formatPrettyCollection(
        [
          { key: 'value', label: 'X' },
          { key: 'extra', label: 'Y' },
        ],
        [{ value, extra: 'force-card-layout' }],
        { columns },
      )
      expect(
        output.split('\n').every((line) => Bun.stringWidth(line) <= columns),
      ).toBe(true)
      expect(output).not.toContain('…')
      if (columns >= 11 && reconstructTable)
        expect(cardValue(output, 'X')).toBe(value)
    }
  }
})
