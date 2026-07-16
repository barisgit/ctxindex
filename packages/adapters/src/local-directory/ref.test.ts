import { describe, expect, test } from 'bun:test'
import { parseRef } from '@ctxindex/core/ref'
import { localDirectoryRef, normalizeRelativePath } from './ref'

const sourceId = '01KXHBNECDAH1T4MJ38X88EPFJ'

describe('localDirectoryRef', () => {
  test('encodes the entire normalized path as one opaque component', () => {
    expect(localDirectoryRef(sourceId.toLowerCase(), 'nested/a b%.md')).toBe(
      `ctx://${sourceId}/file/nested%2Fa%20b%25.md`,
    )
    expect(localDirectoryRef(sourceId, '資料/é.txt')).toBe(
      `ctx://${sourceId}/file/%E8%B3%87%E6%96%99%2F%C3%A9.txt`,
    )
  })

  test('keeps nested paths distinct from percent-looking names', () => {
    expect(localDirectoryRef(sourceId, 'a/b')).not.toBe(
      localDirectoryRef(sourceId, 'a%2Fb'),
    )
  })

  test('produces a parseable Ref owned by the Source', () => {
    const ref = localDirectoryRef(sourceId, 'nested/file.ts')
    expect(parseRef(ref)).toEqual({
      sourceId,
      suffix: 'file/nested%2Ffile.ts',
      ref,
    })
  })
})

describe('normalizeRelativePath', () => {
  test('rejects backslashes, non-relative traversal, and absolute paths', () => {
    expect(() => normalizeRelativePath('nested\\file.ts')).toThrow()
    expect(() => localDirectoryRef(sourceId, 'a\\b')).toThrow()
    expect(localDirectoryRef(sourceId, 'a/b')).not.toBe(
      'ctx://01KXHBNECDAH1T4MJ38X88EPFJ/file/a%5Cb',
    )
    expect(() => normalizeRelativePath('../secret')).toThrow()
    expect(() => normalizeRelativePath('nested/../secret')).toThrow()
    expect(() => normalizeRelativePath('./file.txt')).toThrow()
    expect(() => normalizeRelativePath('/absolute')).toThrow()
    expect(() => normalizeRelativePath('C:/absolute')).toThrow()
  })
})
