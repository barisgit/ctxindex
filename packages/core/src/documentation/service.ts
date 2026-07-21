import { posix } from 'node:path'
import { CtxindexNotFoundError, CtxindexValidationError } from '../errors'
import type {
  DocumentationProjection,
  DocumentationProjectionItem,
} from '../extension'
import { containsTerminalControlCharacters } from '../internal/terminal-controls'

const MAX_SEARCH_RESULTS = 100
const MAX_SNIPPET_CODE_POINTS = 240
const encoder = new TextEncoder()

export type DocumentationOrigin =
  | { readonly kind: 'bundled' }
  | { readonly kind: 'extension'; readonly extensionId: string }

export type DocumentationItem = {
  readonly origin: DocumentationOrigin
  readonly path: string
  readonly kind: 'markdown' | 'asset' | 'metadata'
  readonly mediaType: string
  readonly byteSize: number
  readonly title?: string
  readonly summary?: string
  readonly content: string | Uint8Array
}

export interface DocumentationSource {
  list(): readonly DocumentationItem[]
  get(origin: DocumentationOrigin, path: string): DocumentationItem | undefined
}

export interface DocumentationSearchResult {
  readonly origin: DocumentationOrigin
  readonly path: string
  readonly title?: string
  readonly summary?: string
  readonly snippet: string
}

export interface DocumentationService {
  list(input: { readonly extensionId?: string }): readonly DocumentationItem[]
  get(input: {
    readonly path: string
    readonly extensionId?: string
  }): DocumentationItem
  search(input: {
    readonly query: string
    readonly extensionId?: string
  }): readonly DocumentationSearchResult[]
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

function originKey(origin: DocumentationOrigin): string {
  return origin.kind === 'bundled' ? '0' : `1\0${origin.extensionId}`
}

function itemKey(item: DocumentationItem): string {
  return `${originKey(item.origin)}\0${item.path}`
}

function copyItem(item: DocumentationItem): DocumentationItem {
  return item.kind === 'asset'
    ? { ...item, content: (item.content as Uint8Array).slice() }
    : item
}

function validateLogicalPath(path: string): void {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path !== path.normalize('NFC') ||
    posix.normalize(path) !== path ||
    path
      .split('/')
      .some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new CtxindexValidationError(
      'invalid_filter',
      `Invalid documentation path "${path}"`,
    )
  }
}

function validateBundledItem(item: DocumentationItem): void {
  if (item.origin.kind !== 'bundled') {
    throw new TypeError('Bundled documentation source requires bundled origins')
  }
  validateLogicalPath(item.path)
  const byteSize =
    typeof item.content === 'string'
      ? encoder.encode(item.content).byteLength
      : item.content.byteLength
  if (item.byteSize !== byteSize) {
    throw new TypeError(
      `Invalid bundled documentation byte size at ${item.path}`,
    )
  }
  if (item.kind === 'asset' && typeof item.content === 'string') {
    throw new TypeError(`Invalid bundled documentation asset at ${item.path}`)
  }
  if (item.kind !== 'asset' && typeof item.content !== 'string') {
    throw new TypeError(`Invalid bundled documentation text at ${item.path}`)
  }
}

export function createBundledDocumentationSource(
  input: readonly DocumentationItem[],
): DocumentationSource {
  const ordered = [...input].sort((left, right) =>
    compareCodePoints(left.path, right.path),
  )
  const byPath = new Map<string, DocumentationItem>()
  for (const item of ordered) {
    validateBundledItem(item)
    if (byPath.has(item.path)) {
      throw new TypeError(`Duplicate bundled documentation path ${item.path}`)
    }
    byPath.set(item.path, item)
  }
  const items = Object.freeze(ordered.map(copyItem))
  return Object.freeze({
    list: () => Object.freeze(items.map(copyItem)),
    get: (origin: DocumentationOrigin, path: string) => {
      if (origin.kind !== 'bundled') return undefined
      const item = byPath.get(path)
      return item === undefined ? undefined : copyItem(item)
    },
  })
}

function adaptProjectionItem(
  item: DocumentationProjectionItem,
): DocumentationItem {
  if (
    item.kind === 'markdown' &&
    containsTerminalControlCharacters(item.content as string)
  ) {
    throw new TypeError(
      `Unsafe terminal control in Extension documentation at ${item.path}`,
    )
  }
  const content =
    item.kind === 'asset'
      ? (item.content as Uint8Array).slice()
      : (item.content as string)
  return Object.freeze({
    origin: Object.freeze({
      kind: 'extension' as const,
      extensionId: item.extensionId,
    }),
    path: item.path,
    kind: item.kind,
    mediaType: item.mediaType,
    byteSize:
      typeof content === 'string'
        ? encoder.encode(content).byteLength
        : content.byteLength,
    ...(item.frontmatter?.title === undefined
      ? {}
      : { title: item.frontmatter.title }),
    ...(item.frontmatter?.summary === undefined
      ? {}
      : { summary: item.frontmatter.summary }),
    content,
  })
}

export function createExtensionDocumentationSource(
  projection: DocumentationProjection,
): DocumentationSource {
  const items = Object.freeze(
    projection
      .list()
      .map(adaptProjectionItem)
      .sort((left, right) => compareCodePoints(itemKey(left), itemKey(right))),
  )
  const byKey = new Map(items.map((item) => [itemKey(item), item] as const))
  return Object.freeze({
    list: () => Object.freeze(items.map(copyItem)),
    get: (origin: DocumentationOrigin, path: string) => {
      if (origin.kind !== 'extension') return undefined
      const item = byKey.get(`1\0${origin.extensionId}\0${path}`)
      return item === undefined ? undefined : copyItem(item)
    },
  })
}

function boundedSnippet(content: string, query: string): string {
  const normalized = content.replace(/\s+/gu, ' ').trim()
  const points = Array.from(normalized)
  if (points.length <= MAX_SNIPPET_CODE_POINTS) return normalized
  const match = normalized.toLocaleLowerCase('und').indexOf(query)
  const prefix = normalized.slice(0, Math.max(0, match))
  const matchPoint = Array.from(prefix).length
  const start = Math.max(
    0,
    matchPoint - Math.floor(MAX_SNIPPET_CODE_POINTS / 3),
  )
  const hasPrefix = start > 0
  const initialEnd = Math.min(
    points.length,
    start + MAX_SNIPPET_CODE_POINTS - (hasPrefix ? 1 : 0),
  )
  const end = initialEnd < points.length ? initialEnd - 1 : initialEnd
  return `${start === 0 ? '' : '…'}${points.slice(start, end).join('')}${
    end === points.length ? '' : '…'
  }`
}

export function createDocumentationService(
  sources: readonly DocumentationSource[],
): DocumentationService {
  const allItems = Object.freeze(
    sources
      .flatMap((source) => source.list())
      .sort((left, right) => compareCodePoints(itemKey(left), itemKey(right))),
  )
  const extensionIds = new Set(
    allItems.flatMap(({ origin }) =>
      origin.kind === 'extension' ? [origin.extensionId] : [],
    ),
  )

  function assertKnownExtension(extensionId: string): void {
    if (!extensionIds.has(extensionId)) {
      throw new CtxindexNotFoundError(
        `Unknown documentation Extension "${extensionId}"`,
      )
    }
  }

  function selected(extensionId?: string): readonly DocumentationItem[] {
    if (extensionId === undefined) return allItems
    assertKnownExtension(extensionId)
    return allItems.filter(
      ({ origin }) =>
        origin.kind === 'extension' && origin.extensionId === extensionId,
    )
  }

  return Object.freeze({
    list: ({ extensionId }: { readonly extensionId?: string }) =>
      Object.freeze(selected(extensionId).map(copyItem)),
    get: ({
      path,
      extensionId,
    }: {
      readonly path: string
      readonly extensionId?: string
    }) => {
      validateLogicalPath(path)
      if (extensionId !== undefined) assertKnownExtension(extensionId)
      const origin: DocumentationOrigin =
        extensionId === undefined
          ? { kind: 'bundled' }
          : { kind: 'extension', extensionId }
      for (const source of sources) {
        const item = source.get(origin, path)
        if (item !== undefined) return item
      }
      throw new CtxindexNotFoundError(
        `Documentation path "${path}" was not found${
          extensionId === undefined ? '' : ` in Extension "${extensionId}"`
        }`,
      )
    },
    search: ({
      query,
      extensionId,
    }: {
      readonly query: string
      readonly extensionId?: string
    }) => {
      const normalizedQuery = query.trim().toLocaleLowerCase('und')
      if (normalizedQuery.length === 0) {
        throw new CtxindexValidationError(
          'invalid_filter',
          'Documentation search query must not be empty',
        )
      }
      return Object.freeze(
        selected(extensionId)
          .filter((item) => item.kind === 'markdown')
          .flatMap((item): DocumentationSearchResult[] => {
            const content = item.content as string
            const haystack = [
              item.title ?? '',
              item.summary ?? '',
              item.path,
              content,
            ]
              .join('\n')
              .toLocaleLowerCase('und')
            if (!haystack.includes(normalizedQuery)) return []
            return [
              {
                origin: item.origin,
                path: item.path,
                ...(item.title === undefined ? {} : { title: item.title }),
                ...(item.summary === undefined
                  ? {}
                  : { summary: item.summary }),
                snippet: boundedSnippet(content, normalizedQuery),
              },
            ]
          })
          .slice(0, MAX_SEARCH_RESULTS),
      )
    },
  })
}
