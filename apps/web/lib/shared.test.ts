import { describe, expect, test } from 'bun:test'
import {
  docsSourceUrl,
  pageMetadataUrls,
  pageSlugForRepresentation,
  plainTextResponse,
  resolveSiteOrigin,
} from './shared'

describe('resolveSiteOrigin', () => {
  test('uses and normalizes a configured absolute origin', () => {
    expect(resolveSiteOrigin('https://preview.example.test/docs')?.href).toBe(
      'https://preview.example.test/',
    )
  })

  test('does not invent an origin for an empty configuration', () => {
    expect(resolveSiteOrigin('')).toBeUndefined()
  })

  test('rejects a relative configured origin', () => {
    expect(() => resolveSiteOrigin('/preview')).toThrow()
  })
})

test('pageMetadataUrls emits canonical and social URLs together', () => {
  expect(
    pageMetadataUrls(
      '/docs/cli/search',
      '/og/docs/cli/search/image.png',
      'https://docs.example.test/base',
    ),
  ).toEqual({
    canonical: 'https://docs.example.test/docs/cli/search',
    image: 'https://docs.example.test/og/docs/cli/search/image.png',
  })
  expect(
    pageMetadataUrls('/docs/cli/search', '/og/docs/cli/search/image.png', ''),
  ).toBeUndefined()
  expect(pageMetadataUrls('/', undefined, 'https://docs.example.test')).toEqual(
    { canonical: 'https://docs.example.test/' },
  )
})

test('docsSourceUrl targets the monorepo docs source path', () => {
  expect(docsSourceUrl('cli/search.mdx')).toBe(
    'https://github.com/barisgit/ctxindex/blob/main/apps/web/content/docs/cli/search.mdx',
  )
})

test('plainTextResponse sets a deterministic media type', () => {
  expect(plainTextResponse('docs').headers.get('Content-Type')).toBe(
    'text/plain; charset=utf-8',
  )
})

describe('pageSlugForRepresentation', () => {
  test('removes only the exact required terminal suffix', () => {
    expect(
      pageSlugForRepresentation(['cli', 'search', 'content.md'], 'content.md'),
    ).toEqual(['cli', 'search'])
    expect(pageSlugForRepresentation(['content.md'], 'content.md')).toEqual([])
  })

  test('rejects missing, substituted, and non-terminal suffixes', () => {
    expect(pageSlugForRepresentation(undefined, 'content.md')).toBeUndefined()
    expect(
      pageSlugForRepresentation(['cli', 'search'], 'content.md'),
    ).toBeUndefined()
    expect(
      pageSlugForRepresentation(['cli', 'search', 'other.md'], 'content.md'),
    ).toBeUndefined()
    expect(
      pageSlugForRepresentation(
        ['cli', 'search', 'content.md', 'extra'],
        'content.md',
      ),
    ).toBeUndefined()
  })
})
