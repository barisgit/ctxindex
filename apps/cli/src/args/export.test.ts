import { describe, expect, test } from 'bun:test'
import type { ExportArgs } from './export'
import { parseExportArgs } from './export'

const ref = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one'

describe('export arguments', () => {
  test.each([
    [[ref, '--format', 'eml'], { kind: 'export', ref, format: 'eml' }],
    [['--format', 'eml', ref], { kind: 'export', ref, format: 'eml' }],
    [[ref, '--format=eml'], { kind: 'export', ref, format: 'eml' }],
  ])('parses %j', (args, expected) => {
    expect(parseExportArgs(args)).toEqual(expected as ExportArgs)
  })

  test.each([
    [['--help']],
    [['-h']],
    [[ref, '--help']],
  ])('accepts help', (args) => {
    expect(parseExportArgs(args)).toEqual({ kind: 'help' })
  })

  test.each([
    [[], 'export: missing <ref>'],
    [[ref], 'export: missing --format <f>'],
    [[ref, '--format'], 'export: --format requires a value'],
    [[ref, '--format='], 'export: --format requires a value'],
    [
      [ref, '--format', 'eml', '--format', 'json'],
      'export: duplicate --format',
    ],
    [[ref, '--unknown', 'x'], 'export: unknown flag --unknown'],
    [[ref, '--json'], 'export: unknown flag --json'],
    [[ref, '--output', 'x'], 'export: unknown flag --output'],
    [[ref, 'extra', '--format', 'eml'], 'export: expected exactly one <ref>'],
    [['not-a-ref', '--format', 'json'], 'export: invalid <ref>: not-a-ref'],
  ])('rejects invalid forms', (args, message) => {
    expect(parseExportArgs(args)).toEqual({ kind: 'unknown', message })
  })
})
