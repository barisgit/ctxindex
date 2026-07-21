import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentationService } from '@ctxindex/core/documentation'
import {
  createDocumentationService,
  createExtensionDocumentationSource,
} from '@ctxindex/core/documentation'
import type { DocumentationProjection } from '@ctxindex/core/extension'
import { handleDocsGet, handleDocsList, handleDocsSearch } from './command'

afterEach(() => {
  spyOn(console, 'log').mockRestore()
  spyOn(console, 'error').mockRestore()
  spyOn(process.stdout, 'write').mockRestore()
})

const markdown = {
  origin: { kind: 'bundled' as const },
  path: 'getting-started.md',
  kind: 'markdown' as const,
  mediaType: 'text/markdown',
  byteSize: 15,
  title: 'Getting started',
  content: '# Getting started',
}
const asset = {
  origin: { kind: 'extension' as const, extensionId: 'fixture.docs' },
  path: 'assets/pixel.png',
  kind: 'asset' as const,
  mediaType: 'image/png',
  byteSize: 8,
  content: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
}

const service: DocumentationService = {
  list: () => [markdown, asset],
  get: ({ path }) => (path.endsWith('.png') ? asset : markdown),
  search: () => [
    {
      origin: markdown.origin,
      path: markdown.path,
      title: markdown.title,
      snippet: '# Getting started',
    },
  ],
}

test('prints safe inventory and inert Markdown/JSON', async () => {
  const output = spyOn(console, 'log').mockImplementation(() => {})
  expect(await handleDocsList({ json: true }, async () => service)).toBe(0)
  const inventory = JSON.parse(String(output.mock.calls[0]?.[0]))
  expect(inventory[0]).toEqual({
    origin: 'bundled',
    path: 'getting-started.md',
    kind: 'markdown',
    mediaType: 'text/markdown',
    byteSize: 15,
    title: 'Getting started',
  })
  expect(JSON.stringify(inventory)).not.toContain('content')

  output.mockClear()
  const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true)
  expect(
    await handleDocsGet(
      { path: 'getting-started.md', json: false },
      async () => service,
    ),
  ).toBe(0)
  expect(stdout).toHaveBeenCalledWith('# Getting started')

  output.mockClear()
  expect(
    await handleDocsGet(
      { path: 'getting-started.md', json: true },
      async () => service,
    ),
  ).toBe(0)
  expect(JSON.parse(String(output.mock.calls[0]?.[0])).content).toBe(
    '# Getting started',
  )
})

test('requires explicit asset output and copies exact bytes', async () => {
  const error = spyOn(console, 'error').mockImplementation(() => {})
  expect(
    await handleDocsGet(
      { path: 'assets/pixel.png', extensionId: 'fixture.docs', json: false },
      async () => service,
    ),
  ).toBe(2)
  expect(error.mock.calls[0]?.[0]).toContain('--output')

  const root = await mkdtemp(join(tmpdir(), 'ctxindex-docs-output-'))
  try {
    await mkdir(join(root, 'nested'))
    const outputPath = join(root, 'nested', 'pixel.png')
    spyOn(console, 'log').mockImplementation(() => {})
    expect(
      await handleDocsGet(
        {
          path: 'assets/pixel.png',
          extensionId: 'fixture.docs',
          output: outputPath,
          json: true,
        },
        async () => service,
      ),
    ).toBe(0)
    expect(new Uint8Array(await readFile(outputPath))).toEqual(asset.content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not write Extension terminal controls to stdout', async () => {
  const stdout = spyOn(process.stdout, 'write').mockImplementation(() => true)
  const error = spyOn(console, 'error').mockImplementation(() => {})
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

  expect(
    await handleDocsGet(
      {
        path: 'README.md',
        extensionId: 'fixture.unsafe',
        json: false,
      },
      async () =>
        createDocumentationService([
          createExtensionDocumentationSource(unsafeProjection),
        ]),
    ),
  ).toBe(50)
  expect(stdout).not.toHaveBeenCalled()
  expect(error.mock.calls[0]?.[0]).toContain(
    'Unsafe terminal control in Extension documentation',
  )
})

test('formats bounded search results as JSON', async () => {
  const output = spyOn(console, 'log').mockImplementation(() => {})
  expect(
    await handleDocsSearch(
      { query: 'getting', json: true },
      async () => service,
    ),
  ).toBe(0)
  expect(JSON.parse(String(output.mock.calls[0]?.[0]))[0]).toEqual({
    origin: 'bundled',
    path: 'getting-started.md',
    title: 'Getting started',
    snippet: '# Getting started',
  })
})
