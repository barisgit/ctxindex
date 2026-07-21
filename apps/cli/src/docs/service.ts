import {
  createDocumentationService,
  createExtensionDocumentationSource,
  type DocumentationItem,
  type DocumentationOrigin,
  type DocumentationSearchResult,
  type DocumentationService,
} from '@ctxindex/core/documentation'
import {
  type DaemonSelection,
  daemonDocumentationGet,
  daemonDocumentationList,
  daemonDocumentationSearch,
  selectDaemon,
} from '../daemon/client'
import {
  ensureDaemonSelection,
  selectEnsuredDaemonRoute,
} from '../daemon/ensure'
import { loadCliDefinitions, printExtensionDiagnostics } from '../definitions'
import { resolveBundledDocumentation } from './resolve'

type Awaitable<T> = T | Promise<T>
export type DocumentationListItem = Omit<DocumentationItem, 'content'>

export interface DocsCommandService {
  list(input: {
    readonly extensionId?: string
  }): Awaitable<readonly DocumentationListItem[]>
  get(input: {
    readonly path: string
    readonly extensionId?: string
  }): Awaitable<DocumentationItem>
  search(input: {
    readonly query: string
    readonly extensionId?: string
  }): Awaitable<readonly DocumentationSearchResult[]>
}

export type DocsServiceLoader = () => Promise<DocsCommandService>

export interface DocsRouteServices {
  readonly selectDaemon: typeof selectDaemon
  readonly ensureDaemonSelection?: typeof ensureDaemonSelection
  readonly daemonDocumentationList: typeof daemonDocumentationList
  readonly daemonDocumentationGet: typeof daemonDocumentationGet
  readonly daemonDocumentationSearch: typeof daemonDocumentationSearch
  readonly loadCliDefinitions: typeof loadCliDefinitions
  readonly printExtensionDiagnostics: typeof printExtensionDiagnostics
  readonly resolveBundledDocumentation: typeof resolveBundledDocumentation
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (value) => value.codePointAt(0) as number)
  const rightPoints = Array.from(
    right,
    (value) => value.codePointAt(0) as number,
  )
  for (
    let index = 0;
    index < Math.min(leftPoints.length, rightPoints.length);
    index += 1
  ) {
    const difference =
      (leftPoints[index] as number) - (rightPoints[index] as number)
    if (difference !== 0) return difference
  }
  return leftPoints.length - rightPoints.length
}

function documentationKey(value: {
  readonly origin: DocumentationOrigin
  readonly path: string
}): string {
  return value.origin.kind === 'bundled'
    ? `0\0${value.path}`
    : `1\0${value.origin.extensionId}\0${value.path}`
}

function orderDocumentation<
  T extends {
    readonly origin: DocumentationOrigin
    readonly path: string
  },
>(values: readonly T[]): readonly T[] {
  return Object.freeze(
    [...values].sort((left, right) =>
      compareCodePoints(documentationKey(left), documentationKey(right)),
    ),
  )
}

function extensionOrigin(extensionId: string): DocumentationOrigin {
  return { kind: 'extension', extensionId }
}

function daemonListItem(
  row: Awaited<ReturnType<typeof daemonDocumentationList>>['rows'][number],
): DocumentationListItem {
  return {
    origin: extensionOrigin(row.extensionId),
    path: row.path,
    kind: row.kind,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    ...(row.title === undefined ? {} : { title: row.title }),
    ...(row.summary === undefined ? {} : { summary: row.summary }),
  }
}

function daemonItem(
  item: Awaited<ReturnType<typeof daemonDocumentationGet>>['item'],
): DocumentationItem {
  return {
    ...daemonListItem(item),
    content:
      item.kind === 'asset'
        ? new Uint8Array(Buffer.from(item.contentBase64, 'base64'))
        : item.content,
  }
}

function daemonSearchResult(
  row: Awaited<ReturnType<typeof daemonDocumentationSearch>>['rows'][number],
): DocumentationSearchResult {
  return {
    origin: extensionOrigin(row.extensionId),
    path: row.path,
    ...(row.title === undefined ? {} : { title: row.title }),
    ...(row.summary === undefined ? {} : { summary: row.summary }),
    snippet: row.snippet,
  }
}

function selectedDaemonService(
  selection: DaemonSelection,
  bundled: DocumentationService,
  services: DocsRouteServices,
): DocsCommandService {
  return {
    async list(input) {
      const extension = await services.daemonDocumentationList(selection, {
        ...(input.extensionId === undefined
          ? {}
          : { extensionId: input.extensionId }),
      })
      if (input.extensionId !== undefined) {
        return extension.rows.map(daemonListItem)
      }
      return orderDocumentation([
        ...bundled.list({}),
        ...extension.rows.map(daemonListItem),
      ])
    },
    async get(input) {
      if (input.extensionId === undefined) return bundled.get(input)
      const result = await services.daemonDocumentationGet(selection, {
        extensionId: input.extensionId,
        path: input.path,
      })
      return daemonItem(result.item)
    },
    async search(input) {
      const extension = await services.daemonDocumentationSearch(selection, {
        query: input.query,
        ...(input.extensionId === undefined
          ? {}
          : { extensionId: input.extensionId }),
      })
      if (input.extensionId !== undefined) {
        return extension.rows.map(daemonSearchResult)
      }
      return orderDocumentation([
        ...bundled.search({ query: input.query }),
        ...extension.rows.map(daemonSearchResult),
      ])
    },
  }
}

const defaultRouteServices: DocsRouteServices = {
  selectDaemon,
  ensureDaemonSelection,
  daemonDocumentationList,
  daemonDocumentationGet,
  daemonDocumentationSearch,
  loadCliDefinitions,
  printExtensionDiagnostics,
  resolveBundledDocumentation,
}

export async function loadDocsCommandService(
  services: DocsRouteServices = defaultRouteServices,
): Promise<DocsCommandService> {
  const bundledSource = services.resolveBundledDocumentation()
  const bundled = createDocumentationService([bundledSource])
  const selection = await selectEnsuredDaemonRoute(services)
  if (selection !== null) {
    return selectedDaemonService(selection, bundled, services)
  }
  const loaded = await services.loadCliDefinitions()
  services.printExtensionDiagnostics(loaded.diagnostics)
  return createDocumentationService([
    bundledSource,
    createExtensionDocumentationSource(loaded.documentation),
  ])
}
