import { afterEach, expect, spyOn, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DocumentationService } from '@ctxindex/core/documentation'
import {
  createBundledDocumentationSource,
  createDocumentationService,
  createExtensionDocumentationSource,
} from '@ctxindex/core/documentation'
import { CtxindexError } from '@ctxindex/core/errors'
import type { DocumentationProjection } from '@ctxindex/core/extension'
import type { DaemonSelection } from '../daemon/client'
import {
  handleDocsGet,
  handleDocsList,
  handleDocsSearch,
  loadDocsCommandService,
} from './command'

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
  byteSize: 17,
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
    byteSize: 17,
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

test('selected daemon supplies only Extension docs while bundled docs stay local', async () => {
  const selection = {} as DaemonSelection
  let directLoads = 0
  let daemonGets = 0
  const loaded = await loadDocsCommandService({
    selectDaemon: () => {
      throw new Error('legacy selection invoked')
    },
    ensureDaemonSelection: async () => ({
      status: 'selected',
      selection,
      started: true,
    }),
    loadCliDefinitions: async () => {
      directLoads += 1
      throw new Error('direct loading must not run')
    },
    printExtensionDiagnostics: () => {},
    resolveBundledDocumentation: () =>
      createBundledDocumentationSource([markdown]),
    daemonDocumentationList: async () => ({
      rows: [
        {
          extensionId: 'fixture.docs',
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          byteSize: 9,
          title: 'Fixture',
        },
        {
          extensionId: 'alpha.docs',
          path: 'README.md',
          kind: 'markdown',
          mediaType: 'text/markdown',
          byteSize: 7,
          title: 'Alpha',
        },
      ],
    }),
    daemonDocumentationGet: async (_selection, input) => {
      daemonGets += 1
      return input.path.endsWith('.png')
        ? {
            item: {
              extensionId: 'fixture.docs',
              path: 'assets/pixel.png',
              kind: 'asset',
              mediaType: 'image/png',
              byteSize: 8,
              contentBase64: 'iVBORw0KGgo=',
            },
          }
        : {
            item: {
              extensionId: 'fixture.docs',
              path: 'README.md',
              kind: 'markdown',
              mediaType: 'text/markdown',
              byteSize: 9,
              title: 'Fixture',
              content: '# Fixture',
            },
          }
    },
    daemonDocumentationSearch: async () => ({
      rows: [
        {
          extensionId: 'fixture.docs',
          path: 'README.md',
          title: 'Fixture',
          snippet: '# Fixture',
        },
      ],
    }),
  })

  expect(
    (await loaded.list({})).map((item) =>
      item.origin.kind === 'bundled' ? 'bundled' : item.origin.extensionId,
    ),
  ).toEqual(['bundled', 'alpha.docs', 'fixture.docs'])
  expect(await loaded.get({ path: 'getting-started.md' })).toMatchObject({
    origin: { kind: 'bundled' },
  })
  expect(daemonGets).toBe(0)
  expect(
    await loaded.get({
      extensionId: 'fixture.docs',
      path: 'assets/pixel.png',
    }),
  ).toMatchObject({ kind: 'asset', content: asset.content })
  expect(daemonGets).toBe(1)
  expect(
    (await loaded.search({ query: 'fixture' })).map((row) => row.origin.kind),
  ).toEqual(['extension'])
  expect(
    (await loaded.search({ query: 'getting' })).map((row) => row.origin.kind),
  ).toEqual(['bundled', 'extension'])
  expect(directLoads).toBe(0)
})

test('pre-initialization documentation stays on the safe direct surface', async () => {
  let ensures = 0
  let directLoads = 0
  const loaded = await loadDocsCommandService({
    assertInitialized: async () => {
      throw new CtxindexError(
        'ctxindex is not initialized; run ctxindex init',
        'invalid_args',
      )
    },
    selectDaemon: () => {
      throw new Error('pre-initialization docs must not inspect discovery')
    },
    ensureDaemonSelection: async () => {
      ensures += 1
      throw new Error('pre-initialization docs must not ensure a daemon')
    },
    loadCliDefinitions: async () => {
      directLoads += 1
      return {
        documentation: {
          list: () => [],
          get: () => undefined,
        },
        diagnostics: [],
      } as never
    },
    printExtensionDiagnostics: () => {},
    resolveBundledDocumentation: () =>
      createBundledDocumentationSource([markdown]),
    daemonDocumentationList: async () => {
      throw new Error('must not run')
    },
    daemonDocumentationGet: async () => {
      throw new Error('must not run')
    },
    daemonDocumentationSearch: async () => {
      throw new Error('must not run')
    },
  })

  expect(await loaded.get({ path: 'getting-started.md' })).toMatchObject({
    origin: { kind: 'bundled' },
  })
  expect(ensures).toBe(0)
  expect(directLoads).toBe(1)
})

test('selected daemon failures never fall back to direct Extension loading', async () => {
  let directLoads = 0
  const expected = new Error('selected daemon failed')
  const loaded = await loadDocsCommandService({
    selectDaemon: () => ({}) as DaemonSelection,
    loadCliDefinitions: async () => {
      directLoads += 1
      throw new Error('must not run')
    },
    printExtensionDiagnostics: () => {},
    resolveBundledDocumentation: () =>
      createBundledDocumentationSource([markdown]),
    daemonDocumentationList: async () => {
      throw expected
    },
    daemonDocumentationGet: async () => {
      throw expected
    },
    daemonDocumentationSearch: async () => {
      throw expected
    },
  })
  await expect(loaded.list({})).rejects.toBe(expected)
  expect(directLoads).toBe(0)
})

test('direct mode retains local Extension documentation composition', async () => {
  let directLoads = 0
  const loaded = await loadDocsCommandService({
    selectDaemon: () => null,
    loadCliDefinitions: async () => {
      directLoads += 1
      return {
        documentation: {
          list: () => [
            {
              extensionId: 'fixture.docs',
              path: 'README.md',
              origin: 'authored',
              kind: 'markdown',
              mediaType: 'text/markdown',
              content: '# Fixture',
            },
          ],
          get: () => undefined,
        },
        diagnostics: [],
      } as never
    },
    printExtensionDiagnostics: () => {},
    resolveBundledDocumentation: () =>
      createBundledDocumentationSource([markdown]),
    daemonDocumentationList: async () => {
      throw new Error('must not run')
    },
    daemonDocumentationGet: async () => {
      throw new Error('must not run')
    },
    daemonDocumentationSearch: async () => {
      throw new Error('must not run')
    },
  })
  expect((await loaded.list({})).map((item) => item.origin.kind)).toEqual([
    'bundled',
    'extension',
  ])
  expect(directLoads).toBe(1)
})
