import { expect, test } from 'bun:test'
import { type DocumentationDeclaration, defineExtension, docs } from './index'

test('docs returns plain eager directory and virtual declarations', () => {
  expect(docs('./docs')).toEqual({ kind: 'directory', path: './docs' })

  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  expect(
    docs({
      index: 'README.md',
      files: [
        {
          path: 'README.md',
          kind: 'markdown',
          content: '# Fixture',
          mediaType: 'text/markdown',
        },
        {
          path: 'assets/logo.png',
          kind: 'asset',
          content: image,
          mediaType: 'image/png',
        },
      ],
    }),
  ).toEqual({
    kind: 'virtual',
    index: 'README.md',
    files: [
      {
        path: 'README.md',
        kind: 'markdown',
        content: '# Fixture',
        mediaType: 'text/markdown',
      },
      {
        path: 'assets/logo.png',
        kind: 'asset',
        content: image,
        mediaType: 'image/png',
      },
    ],
  })
})

test('defineExtension carries exactly one documentation declaration', () => {
  const documentation = docs('./docs')
  const extension = defineExtension({
    id: 'fixture.documented',
    docs: documentation,
  })

  expect(extension.docs).toBe(documentation)
  const erased: DocumentationDeclaration | undefined = extension.docs
  void erased

  defineExtension({
    id: 'fixture.invalid-docs',
    // @ts-expect-error An Extension accepts one declaration, not both forms.
    docs: [docs('./docs'), docs({ index: 'README.md', files: [] })],
  })
})
