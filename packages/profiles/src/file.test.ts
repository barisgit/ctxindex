import { describe, expect, test } from 'bun:test'
import { fileProfile, fileSchema } from './index'

const payload = {
  path: 'notes/project/readme.md',
  name: 'readme.md',
  mediaType: 'text/markdown',
  byteSize: 42,
  modifiedAt: '2026-07-16T12:34:56.000Z',
  contentHash:
    'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  text: 'Project notes',
}

describe('fileProfile', () => {
  test('validates and deterministically projects a file payload', () => {
    const parsed = fileSchema.parse(payload)

    expect(fileProfile.id).toBe('file')
    expect(fileProfile.version).toBe(1)
    expect(fileProfile.search?.title?.(parsed)).toBe('notes/project/readme.md')
    expect(fileProfile.search?.occurredAt?.(parsed)).toEqual(
      new Date('2026-07-16T12:34:56.000Z'),
    )
    expect(fileProfile.search?.chunks?.(parsed)).toEqual(['Project notes'])
    expect(
      Object.fromEntries(
        Object.entries(fileProfile.search?.fields ?? {}).map(
          ([name, field]) => [name, field.extract(parsed)],
        ),
      ),
    ).toEqual({
      path: 'notes/project/readme.md',
      name: 'readme.md',
      extension: 'md',
      mediaType: 'text/markdown',
      size: 42,
      modifiedAt: new Date('2026-07-16T12:34:56.000Z'),
      contentHash:
        'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    })
  })

  test('declares only the file search vocabulary', () => {
    const fields = fileProfile.search?.fields
    const noExtension = fileSchema.parse({
      ...payload,
      path: 'LICENSE',
      name: 'LICENSE',
    })

    expect(fileProfile.docs).toEqual({
      summary: 'An extracted local file.',
      aliases: ['files'],
    })
    expect(fileProfile.actions).toBeUndefined()
    expect(fileProfile.exports).toBeUndefined()
    expect(fields?.extension?.extract(noExtension)).toBeUndefined()
    expect(
      Object.fromEntries(
        Object.entries(fields ?? {}).map(([name, field]) => [name, field.type]),
      ),
    ).toEqual({
      path: 'string',
      name: 'string',
      extension: 'string',
      mediaType: 'string',
      size: 'number',
      modifiedAt: 'datetime',
      contentHash: 'string',
    })
  })

  test('rejects invalid paths, hashes, dates, and unknown fields', () => {
    const invalidPayloads = [
      { ...payload, path: '' },
      { ...payload, path: '/absolute/readme.md' },
      { ...payload, path: 'C:/absolute/readme.md' },
      { ...payload, path: 'notes\\readme.md' },
      { ...payload, path: 'notes/../readme.md' },
      { ...payload, contentHash: `sha256:${'A'.repeat(64)}` },
      { ...payload, contentHash: 'sha256:abc' },
      { ...payload, modifiedAt: '2026-07-16T14:34:56+02:00' },
      { ...payload, extra: true },
    ]

    for (const invalidPayload of invalidPayloads) {
      expect(fileSchema.safeParse(invalidPayload).success).toBe(false)
    }
  })
})
