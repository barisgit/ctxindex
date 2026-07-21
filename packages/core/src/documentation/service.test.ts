import { expect, test } from 'bun:test'
import type { DocumentationProjection } from '../extension'
import {
  createBundledDocumentationSource,
  createDocumentationService,
  createExtensionDocumentationSource,
  type DocumentationItem,
} from './service'

const bundled: readonly DocumentationItem[] = [
  {
    origin: { kind: 'bundled' },
    path: 'getting-started.md',
    kind: 'markdown',
    mediaType: 'text/markdown',
    byteSize: 46,
    title: 'Getting started',
    summary: 'Start locally.',
    content: '# Getting started\n\nAlpha needle and more text.',
  },
  {
    origin: { kind: 'bundled' },
    path: 'assets/diagram.png',
    kind: 'asset',
    mediaType: 'image/png',
    byteSize: 8,
    content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
  },
]

const projection: DocumentationProjection = {
  list: () => [
    {
      extensionId: 'fixture.docs',
      path: 'README.md',
      origin: 'authored',
      kind: 'markdown',
      mediaType: 'text/markdown',
      content: '# Fixture\n\nNeedle from an Extension.',
      frontmatter: { title: 'Fixture', summary: 'Fixture docs.' },
    },
    {
      extensionId: 'fixture.docs',
      path: 'assets/pixel.png',
      origin: 'authored',
      kind: 'asset',
      mediaType: 'image/png',
      content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    },
    {
      extensionId: 'fixture.other',
      path: 'generated/profiles/fixture.json',
      origin: 'generated',
      kind: 'metadata',
      mediaType: 'application/json',
      content: '{"id":"fixture"}',
    },
  ],
  get(extensionId, path) {
    return this.list().find(
      (item) => item.extensionId === extensionId && item.path === path,
    )
  },
}

function service() {
  return createDocumentationService([
    createBundledDocumentationSource(bundled),
    createExtensionDocumentationSource(projection),
  ])
}

test('composes safe deterministic bundled and Extension inventory', () => {
  expect(
    service()
      .list({})
      .map(({ origin, path, byteSize }) => ({ origin, path, byteSize })),
  ).toEqual([
    {
      origin: { kind: 'bundled' },
      path: 'assets/diagram.png',
      byteSize: 8,
    },
    {
      origin: { kind: 'bundled' },
      path: 'getting-started.md',
      byteSize: 46,
    },
    {
      origin: { kind: 'extension', extensionId: 'fixture.docs' },
      path: 'README.md',
      byteSize: 36,
    },
    {
      origin: { kind: 'extension', extensionId: 'fixture.docs' },
      path: 'assets/pixel.png',
      byteSize: 8,
    },
    {
      origin: { kind: 'extension', extensionId: 'fixture.other' },
      path: 'generated/profiles/fixture.json',
      byteSize: 16,
    },
  ])
  expect(service().list({ extensionId: 'fixture.docs' })).toHaveLength(2)
  expect(() => service().list({ extensionId: 'missing' })).toThrow(
    'Unknown documentation Extension "missing"',
  )
})

test('selects exact origin and normalized logical path', () => {
  expect(service().get({ path: 'getting-started.md' }).origin).toEqual({
    kind: 'bundled',
  })
  expect(
    service().get({ path: 'README.md', extensionId: 'fixture.docs' }).origin,
  ).toEqual({ kind: 'extension', extensionId: 'fixture.docs' })
  expect(() => service().get({ path: '../README.md' })).toThrow(
    'Invalid documentation path',
  )
  expect(() =>
    service().get({ path: '/tmp/README.md', extensionId: 'fixture.docs' }),
  ).toThrow('Invalid documentation path')
})

test('rejects terminal controls from an Extension projection', () => {
  const unsafeProjection: DocumentationProjection = {
    list: () => [
      {
        extensionId: 'fixture.unsafe',
        path: 'README.md',
        origin: 'authored',
        kind: 'markdown',
        mediaType: 'text/markdown',
        content: '# Fixture\n\n\u001b]0;injected\u0007',
      },
    ],
    get: () => undefined,
  }
  expect(() => createExtensionDocumentationSource(unsafeProjection)).toThrow(
    'Unsafe terminal control in Extension documentation at README.md',
  )
})

test('preserves safe Extension Markdown exactly', () => {
  const content = '# Fixture\r\n\r\n\tIndented\r\n'
  const exactProjection: DocumentationProjection = {
    list: () => [
      {
        extensionId: 'fixture.exact',
        path: 'README.md',
        origin: 'authored',
        kind: 'markdown',
        mediaType: 'text/markdown',
        content,
      },
    ],
    get: () => undefined,
  }
  const source = createExtensionDocumentationSource(exactProjection)
  expect(
    source.get({ kind: 'extension', extensionId: 'fixture.exact' }, 'README.md')
      ?.content,
  ).toBe(content)
})

test('searches only text with bounded deterministic snippets', () => {
  const results = service().search({ query: 'needle' })
  expect(results.map(({ origin, path }) => ({ origin, path }))).toEqual([
    { origin: { kind: 'bundled' }, path: 'getting-started.md' },
    {
      origin: { kind: 'extension', extensionId: 'fixture.docs' },
      path: 'README.md',
    },
  ])
  expect(results.every(({ snippet }) => snippet.length <= 240)).toBe(true)
  expect(service().search({ query: 'PNG' })).toEqual([])
  expect(() => service().search({ query: '   ' })).toThrow(
    'Documentation search query must not be empty',
  )
})

test('bounds long snippets including both omission markers', () => {
  const content = `${'before '.repeat(80)}needle ${'after '.repeat(80)}`
  const source = createBundledDocumentationSource([
    {
      origin: { kind: 'bundled' },
      path: 'long.md',
      kind: 'markdown',
      mediaType: 'text/markdown',
      byteSize: new TextEncoder().encode(content).byteLength,
      content,
    },
  ])
  const [result] = createDocumentationService([source]).search({
    query: 'needle',
  })
  expect(result?.snippet.startsWith('…')).toBe(true)
  expect(result?.snippet.endsWith('…')).toBe(true)
  expect(Array.from(result?.snippet ?? '')).toHaveLength(240)
})
