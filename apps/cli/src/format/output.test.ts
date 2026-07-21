import { describe, expect, test } from 'bun:test'
import {
  formatPrettyCollection,
  formatTsv,
  resolveOutputFormat,
} from './output'

describe('structured output selection', () => {
  test('resolves explicit modes and destination-aware defaults', () => {
    expect(resolveOutputFormat({ format: 'pretty' }, { isTTY: false })).toBe(
      'pretty',
    )
    expect(resolveOutputFormat({ json: true }, { isTTY: true })).toBe('json')
    expect(resolveOutputFormat({}, { isTTY: true })).toBe('pretty')
    expect(resolveOutputFormat({}, { isTTY: false })).toBe('text')
  })

  test('rejects combining --json with any --format value', () => {
    expect(() =>
      resolveOutputFormat({ format: 'json', json: true }, { isTTY: false }),
    ).toThrow('cannot combine --json with --format')
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
  expect(output).toContain(ref)
  expect(output).toContain('Ref')
  expect(output).not.toContain('…')
  expect(output).not.toContain('...')
})
