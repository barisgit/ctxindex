import { chmod, link, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type {
  DocumentationItem,
  DocumentationOrigin,
  DocumentationSearchResult,
} from '@ctxindex/core/documentation'
import { CtxindexError } from '@ctxindex/core/errors'
import { defineCtxCommand } from '../command-model'
import { mapErrorToExit, runWithExit } from '../format/exit'
import {
  type DocsServiceLoader,
  type DocumentationListItem,
  loadDocsCommandService,
} from './service'

export { loadDocsCommandService } from './service'

interface DocsListInput {
  readonly extensionId?: string
  readonly json: boolean
}

interface DocsGetInput extends DocsListInput {
  readonly path: string
  readonly output?: string
}

interface DocsSearchInput extends DocsListInput {
  readonly query: string
}

function safeOrigin(origin: DocumentationOrigin): {
  readonly origin: 'bundled' | 'extension'
  readonly extensionId?: string
} {
  return origin.kind === 'bundled'
    ? { origin: 'bundled' }
    : { origin: 'extension', extensionId: origin.extensionId }
}

function safeItem(
  item: DocumentationListItem | DocumentationItem,
  includeContent = false,
) {
  return {
    ...safeOrigin(item.origin),
    path: item.path,
    kind: item.kind,
    mediaType: item.mediaType,
    byteSize: item.byteSize,
    ...(item.title === undefined ? {} : { title: item.title }),
    ...(item.summary === undefined ? {} : { summary: item.summary }),
    ...(includeContent && 'content' in item && typeof item.content === 'string'
      ? { content: item.content }
      : {}),
  }
}

function safeSearchResult(result: DocumentationSearchResult) {
  return {
    ...safeOrigin(result.origin),
    path: result.path,
    ...(result.title === undefined ? {} : { title: result.title }),
    ...(result.summary === undefined ? {} : { summary: result.summary }),
    snippet: result.snippet,
  }
}

function readableOrigin(origin: DocumentationOrigin): string {
  return origin.kind === 'bundled'
    ? 'bundled'
    : `extension:${origin.extensionId}`
}

async function copyExactOutput(
  outputPath: string,
  content: string | Uint8Array,
): Promise<void> {
  const directory = dirname(outputPath)
  const temporaryDirectory = await mkdtemp(
    join(directory, `.${basename(outputPath)}.ctxindex-docs-`),
  )
  const temporaryPath = join(temporaryDirectory, 'content')
  try {
    await writeFile(temporaryPath, content, { mode: 0o600 })
    await chmod(temporaryPath, 0o600)
    try {
      await link(temporaryPath, outputPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new CtxindexError(
          `Output path already exists: ${outputPath}`,
          'output_exists',
        )
      }
      throw error
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

const loadDefaultService: DocsServiceLoader = loadDocsCommandService

export async function handleDocsList(
  input: DocsListInput,
  loadService: DocsServiceLoader = loadDefaultService,
): Promise<number> {
  try {
    const items = await (await loadService()).list({
      ...(input.extensionId === undefined
        ? {}
        : { extensionId: input.extensionId }),
    })
    if (input.json)
      console.log(
        JSON.stringify(
          items.map((item) => safeItem(item)),
          null,
          2,
        ),
      )
    else {
      const output = items
        .map(
          (item) =>
            `${readableOrigin(item.origin)}\t${item.path}\t${item.kind}\t${item.mediaType}\t${item.byteSize}`,
        )
        .join('\n')
      if (output.length > 0) console.log(output)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}

export async function handleDocsGet(
  input: DocsGetInput,
  loadService: DocsServiceLoader = loadDefaultService,
): Promise<number> {
  try {
    const item = await (await loadService()).get({
      path: input.path,
      ...(input.extensionId === undefined
        ? {}
        : { extensionId: input.extensionId }),
    })
    if (item.kind === 'asset' && input.output === undefined) {
      throw Object.assign(
        new TypeError('Documentation assets require an explicit --output path'),
        { exitCode: 2 },
      )
    }
    if (input.output !== undefined) {
      await copyExactOutput(input.output, item.content)
      if (input.json) console.log(JSON.stringify(safeItem(item), null, 2))
      else
        console.log(
          `${readableOrigin(item.origin)}\t${item.path}\t${item.byteSize} bytes copied`,
        )
      return 0
    }
    if (input.json) console.log(JSON.stringify(safeItem(item, true), null, 2))
    else process.stdout.write(item.content as string)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}

export async function handleDocsSearch(
  input: DocsSearchInput,
  loadService: DocsServiceLoader = loadDefaultService,
): Promise<number> {
  try {
    const results = await (await loadService()).search({
      query: input.query,
      ...(input.extensionId === undefined
        ? {}
        : { extensionId: input.extensionId }),
    })
    if (input.json)
      console.log(JSON.stringify(results.map(safeSearchResult), null, 2))
    else {
      const output = results
        .map(
          (result) =>
            `${readableOrigin(result.origin)}\t${result.path}\t${result.snippet}`,
        )
        .join('\n')
      if (output.length > 0) console.log(output)
    }
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return mapErrorToExit(error)
  }
}

export const docsListCommand = defineCtxCommand({
  meta: { name: 'list', description: 'List offline documentation.' },
  args: {
    extension: {
      type: 'string',
      description: 'Filter by one exact loaded Extension id',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleDocsList({
        ...(args.extension === undefined
          ? {}
          : { extensionId: args.extension }),
        json: args.json ?? false,
      }),
    ),
})

export const docsGetCommand = defineCtxCommand({
  meta: { name: 'get', description: 'Retrieve exact offline documentation.' },
  args: {
    path: {
      type: 'positional',
      required: true,
      description: 'Normalized logical POSIX path',
    },
    extension: {
      type: 'string',
      description: 'Filter by one exact loaded Extension id',
    },
    output: {
      type: 'string',
      description: 'Copy content to this explicit output path',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleDocsGet({
        path: args.path,
        ...(args.extension === undefined
          ? {}
          : { extensionId: args.extension }),
        ...(args.output === undefined ? {} : { output: args.output }),
        json: args.json ?? false,
      }),
    ),
})

export const docsSearchCommand = defineCtxCommand({
  meta: { name: 'search', description: 'Search offline documentation.' },
  args: {
    query: {
      type: 'positional',
      required: true,
      description: 'Case-insensitive text query',
    },
    extension: {
      type: 'string',
      description: 'Filter by one exact loaded Extension id',
    },
    json: { type: 'boolean', description: 'Print JSON' },
  },
  run: ({ args }) =>
    runWithExit(() =>
      handleDocsSearch({
        query: args.query,
        ...(args.extension === undefined
          ? {}
          : { extensionId: args.extension }),
        json: args.json ?? false,
      }),
    ),
})
