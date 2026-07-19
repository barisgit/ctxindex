import { describe, expect, test } from 'bun:test'
import { GET as getMarkdown } from './llms.mdx/docs/[[...slug]]/route'
import { GET as getImage } from './og/docs/[...slug]/route'

const request = new Request('https://docs.example.test/')

describe('generated documentation representation routes', () => {
  test.each([
    undefined,
    [['cli', 'search']],
    [['cli', 'search', 'other.md']],
    [['cli', 'search', 'content.md', 'extra']],
  ])('returns not found for malformed Markdown slug %p', async (slug) => {
    expect(slug === undefined || Array.isArray(slug)).toBe(true)
    await expect(
      getMarkdown(request, {
        params: Promise.resolve({ slug }),
      } as never),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  test.each([
    [['cli', 'search']],
    [['cli', 'search', 'other.png']],
    [['cli', 'search', 'image.png', 'extra']],
  ])('returns not found for malformed image slug %p', async (slug) => {
    expect(Array.isArray(slug)).toBe(true)
    await expect(
      getImage(request, {
        params: Promise.resolve({ slug }),
      } as never),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404')
  })
})
