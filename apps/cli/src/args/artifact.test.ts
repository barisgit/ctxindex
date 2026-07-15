import { describe, expect, test } from 'bun:test'
import { parseArtifactDownloadArgs, parseArtifactListArgs } from './artifact'

const ref = 'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/message/one/attachment/file'

describe('artifact arguments', () => {
  test('parses list and download forms', () => {
    expect(parseArtifactListArgs([ref, '--json'])).toEqual({
      kind: 'list',
      ref,
      json: true,
    })
    expect(
      parseArtifactDownloadArgs([ref, '--output', '/tmp/file', '--json']),
    ).toEqual({
      kind: 'download',
      ref,
      outputPath: '/tmp/file',
      json: true,
    })
  })

  test.each([
    [() => parseArtifactListArgs([]), 'artifact list: missing <ref>'],
    [
      () => parseArtifactDownloadArgs([]),
      'artifact download: missing <artifact-ref>',
    ],
    [
      () => parseArtifactDownloadArgs([ref, '--output']),
      'artifact download: --output requires a path',
    ],
    [
      () => parseArtifactListArgs([ref, '--output', 'x']),
      'artifact list: unknown flag --output',
    ],
  ])('rejects invalid forms', (parse, message) => {
    expect(parse()).toEqual({ kind: 'unknown', message })
  })
})
