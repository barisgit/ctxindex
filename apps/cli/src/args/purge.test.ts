import { describe, expect, test } from 'bun:test'
import { parsePurgeArtifactsArgs } from './purge'

describe('purge artifacts arguments', () => {
  test('accepts only the optional JSON flag', () => {
    expect(parsePurgeArtifactsArgs([])).toEqual({ kind: 'purge', json: false })
    expect(parsePurgeArtifactsArgs(['--json'])).toEqual({
      kind: 'purge',
      json: true,
    })
  })

  test.each([
    [['extra'], 'purge artifacts: unexpected argument extra'],
    [['--force'], 'purge artifacts: unknown flag --force'],
    [['--json', '--json'], 'purge artifacts: --json may be specified once'],
    [['--json=true'], 'purge artifacts: unknown flag --json=true'],
  ])('rejects extra arguments and flags', (args, message) => {
    expect(parsePurgeArtifactsArgs(args)).toEqual({ kind: 'unknown', message })
  })
})
