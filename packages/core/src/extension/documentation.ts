import type { Stats } from 'node:fs'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { extname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AnyExtensionDefinition,
  DocumentationAssetMediaType,
  DocumentationDeclaration,
} from '@ctxindex/extension-sdk'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { z } from 'zod'
import { compareUnicodeCodePoints } from '../internal/code-point-order'
import { containsTerminalControlCharacters } from '../internal/terminal-controls'
import type { CollectedExtension } from '../registry/complete-registry'
import { createExtensionHostDiagnostic } from './diagnostics'

const MAX_FILES = 256
const MAX_DEPTH = 8
const MAX_TOTAL_BYTES = 8 * 1024 * 1024
const MAX_MARKDOWN_BYTES = 256 * 1024
const MAX_FRONTMATTER_BYTES = 16 * 1024
const MAX_ASSET_BYTES = 2 * 1024 * 1024
const MAX_PATH_BYTES = 512
const MAX_REFERENCES_PER_FILE = 512
const MAX_REFERENCES = 4_096

export interface DocumentationFrontmatter {
  readonly title?: string
  readonly summary?: string
  readonly order?: number
}

export type DocumentationDefinitionIdentity =
  | { readonly kind: 'provider'; readonly id: string }
  | { readonly kind: 'adapter'; readonly id: string }
  | { readonly kind: 'profile'; readonly id: string; readonly version: number }

export type ResolvedDocumentationFile =
  | {
      readonly path: string
      readonly kind: 'markdown'
      readonly content: string
      readonly mediaType: 'text/markdown'
      readonly frontmatter?: DocumentationFrontmatter
      readonly definition?: DocumentationDefinitionIdentity
    }
  | {
      readonly path: string
      readonly kind: 'asset'
      readonly content: Uint8Array
      readonly mediaType: DocumentationAssetMediaType
    }

export interface ResolvedDocumentationTree {
  readonly index: 'README.md'
  readonly files: readonly ResolvedDocumentationFile[]
}

export interface ResolvedExtensionDocumentation {
  readonly definition: AnyExtensionDefinition
  readonly documentation?: ResolvedDocumentationTree
}

export type DocumentationProjectionItem = {
  readonly extensionId: string
  readonly path: string
  readonly origin: 'authored' | 'generated'
  readonly kind: 'markdown' | 'asset' | 'metadata'
  readonly mediaType:
    | 'text/markdown'
    | 'application/json'
    | DocumentationAssetMediaType
  readonly content: string | Uint8Array
  readonly definition?: DocumentationDefinitionIdentity
  readonly frontmatter?: DocumentationFrontmatter
  readonly aliasOf?: string
}

export interface DocumentationProjection {
  /**
   * Returns passive data, never trusted HTML. A browser consumer must sanitize
   * Markdown again, disable raw HTML and active attributes, allow only safe URL
   * schemes, and prevent network-loaded media.
   */
  list(): readonly DocumentationProjectionItem[]
  get(
    extensionId: string,
    path: string,
  ): DocumentationProjectionItem | undefined
}

interface CandidateFile {
  readonly path: string
  readonly kind: 'markdown' | 'asset'
  readonly content: string | Uint8Array
  readonly mediaType: 'text/markdown' | DocumentationAssetMediaType
}

function invalid(path = 'docs'): never {
  throw createExtensionHostDiagnostic(
    `Invalid Extension documentation at ${path}`,
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return (
    keys.every((key) => allowed.includes(key)) &&
    required.every((key) => keys.includes(key))
  )
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function validateLogicalPath(path: string): readonly string[] {
  if (
    path.length === 0 ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.startsWith('/') ||
    path !== path.normalize('NFC') ||
    byteLength(path) > MAX_PATH_BYTES
  )
    invalid(path || 'docs')
  const segments = path.split('/')
  if (
    segments.length > MAX_DEPTH ||
    segments.some((segment) =>
      segment === '' || segment === '.' || segment === '..'
        ? true
        : byteLength(segment) === 0,
    )
  )
    invalid(path)
  return segments
}

function inferredAssetType(
  bytes: Uint8Array,
): DocumentationAssetMediaType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png'
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg'
  const header = new TextDecoder().decode(bytes.slice(0, 6))
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif'
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp'
  return undefined
}

function expectedAssetType(
  path: string,
): DocumentationAssetMediaType | undefined {
  switch (extname(path).toLocaleLowerCase('und')) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return undefined
  }
}

function decodeMarkdown(bytes: Uint8Array, path: string): string {
  if (bytes.byteLength > MAX_MARKDOWN_BYTES) invalid(path)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return invalid(path)
  }
}

function parseScalar(value: string, path: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) invalid(path)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    return trimmed.slice(1, -1)
  if (/[[\]{}&*!|>%@`]/u.test(trimmed)) invalid(path)
  return trimmed
}

function parseFrontmatter(
  content: string,
  path: string,
): DocumentationFrontmatter | undefined {
  if (!(content.startsWith('---\n') || content.startsWith('---\r\n')))
    return undefined
  const normalized = content.replaceAll('\r\n', '\n')
  const end = normalized.indexOf('\n---\n', 4)
  if (
    end < 0 ||
    byteLength(normalized.slice(0, end + 5)) > MAX_FRONTMATTER_BYTES
  )
    invalid(path)
  const result: { title?: string; summary?: string; order?: number } = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    if (line.trim().length === 0) continue
    const match = /^(title|summary|order):\s*(.*)$/u.exec(line)
    if (match === null) invalid(path)
    const key = match[1] as 'title' | 'summary' | 'order'
    if (key in result) invalid(path)
    if (key === 'order') {
      if (!/^-?\d+$/u.test(match[2] as string)) invalid(path)
      const order = Number(match[2])
      if (!Number.isSafeInteger(order)) invalid(path)
      result.order = order
    } else {
      result[key] = parseScalar(match[2] as string, path)
    }
  }
  return Object.freeze(result)
}

interface MarkdownReference {
  readonly destination: string
  readonly image: boolean
}

interface MarkdownNode {
  readonly type: string
  readonly url?: string
  readonly identifier?: string
  readonly children?: readonly MarkdownNode[]
}

function markdownReferences(
  content: string,
  path: string,
): readonly MarkdownReference[] {
  let tree: MarkdownNode
  try {
    tree = fromMarkdown(content) as MarkdownNode
  } catch {
    return invalid(path)
  }
  const definitions = new Map<string, string>()
  const references: MarkdownReference[] = []

  function collectDefinitions(node: MarkdownNode): void {
    if (
      node.type === 'definition' &&
      node.identifier !== undefined &&
      node.url !== undefined &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node.url)
    }
    for (const child of node.children ?? []) collectDefinitions(child)
  }
  function collectReferences(node: MarkdownNode): void {
    if (node.type === 'html') invalid(path)
    if (
      (node.type === 'link' || node.type === 'image') &&
      node.url !== undefined
    ) {
      references.push({ image: node.type === 'image', destination: node.url })
    }
    if (
      (node.type === 'linkReference' || node.type === 'imageReference') &&
      node.identifier !== undefined
    ) {
      const destination = definitions.get(node.identifier)
      if (destination === undefined) invalid(path)
      references.push({
        image: node.type === 'imageReference',
        destination,
      })
    }
    for (const child of node.children ?? []) collectReferences(child)
  }
  collectDefinitions(tree)
  collectReferences(tree)
  if (references.length > MAX_REFERENCES_PER_FILE) invalid(path)
  return references
}

function validateReference(
  reference: MarkdownReference,
  sourcePath: string,
  paths: ReadonlySet<string>,
): void {
  const destination = reference.destination.trim()
  if (
    destination.length === 0 ||
    destination.includes('\0') ||
    destination.includes('\\') ||
    destination.startsWith('//')
  )
    invalid(sourcePath)
  if (destination.startsWith('#')) return

  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(destination)?.[1]
  if (scheme !== undefined) {
    if (scheme.toLocaleLowerCase('und') !== 'https' || reference.image)
      invalid(sourcePath)
    try {
      const parsed = new URL(destination)
      if (parsed.protocol !== 'https:') invalid(sourcePath)
    } catch {
      invalid(sourcePath)
    }
    return
  }
  if (
    destination.startsWith('/') ||
    destination.includes('%') ||
    destination.includes('?')
  )
    invalid(sourcePath)
  const withoutFragment = destination.split('#', 1)[0] as string
  if (withoutFragment.length === 0) return
  const segments = withoutFragment.split('/')
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  )
    invalid(sourcePath)
  const target = posix.normalize(
    posix.join(posix.dirname(sourcePath), withoutFragment),
  )
  if (
    target === '..' ||
    target.startsWith('../') ||
    target.startsWith('/') ||
    !paths.has(target)
  )
    invalid(sourcePath)
}

function definitionIdentity(
  path: string,
  extension: AnyExtensionDefinition,
): DocumentationDefinitionIdentity | undefined {
  const provider = /^providers\/(.+)\.md$/u.exec(path)
  if (provider !== null) {
    const id = provider[1] as string
    const providers = [
      ...extension.providers,
      ...extension.oauthApps.map((candidate) => candidate.provider),
      ...extension.adapters.flatMap((candidate) =>
        candidate.provider === undefined ? [] : [candidate.provider],
      ),
    ]
    if (!providers.some((candidate) => candidate.id === id)) invalid(path)
    return Object.freeze({ kind: 'provider' as const, id })
  }
  const adapter = /^adapters\/(.+)\.md$/u.exec(path)
  if (adapter !== null) {
    const id = adapter[1] as string
    if (!extension.adapters.some((candidate) => candidate.id === id))
      invalid(path)
    return Object.freeze({ kind: 'adapter' as const, id })
  }
  const profile = /^profiles\/(.+)@(\d+)\.md$/u.exec(path)
  if (profile !== null) {
    const id = profile[1] as string
    const version = Number(profile[2])
    if (
      !Number.isSafeInteger(version) ||
      version <= 0 ||
      ![
        ...extension.profiles,
        ...extension.adapters.flatMap((candidate) => candidate.profiles),
      ].some(
        (candidate) => candidate.id === id && candidate.version === version,
      )
    )
      invalid(path)
    return Object.freeze({ kind: 'profile' as const, id, version })
  }
  return undefined
}

function validateRoute(
  path: string,
  extension: AnyExtensionDefinition,
): DocumentationDefinitionIdentity | undefined {
  if (path === 'README.md') return undefined
  const segments = path.split('/')
  if (segments[0] === 'guides' && segments.length === 2 && path.endsWith('.md'))
    return undefined
  if (segments[0] === 'assets' && segments.length >= 2) return undefined
  return definitionIdentity(path, extension) ?? invalid(path)
}

function normalizeCandidates(
  candidates: readonly CandidateFile[],
  extension: AnyExtensionDefinition,
): ResolvedDocumentationTree {
  if (candidates.length === 0 || candidates.length > MAX_FILES) invalid('docs')
  let totalBytes = 0
  const seen = new Set<string>()
  const folded = new Set<string>()
  const ordered = [...candidates].sort((left, right) =>
    compareUnicodeCodePoints(left.path, right.path),
  )
  for (const candidate of ordered) {
    validateLogicalPath(candidate.path)
    if (seen.has(candidate.path)) invalid(candidate.path)
    seen.add(candidate.path)
    const collisionKey = candidate.path
      .normalize('NFC')
      .toLocaleUpperCase('und')
      .toLocaleLowerCase('und')
    if (folded.has(collisionKey)) invalid(candidate.path)
    folded.add(collisionKey)
    const bytes =
      typeof candidate.content === 'string'
        ? byteLength(candidate.content)
        : candidate.content.byteLength
    totalBytes += bytes
    if (totalBytes > MAX_TOTAL_BYTES) invalid(candidate.path)
  }
  if (!seen.has('README.md')) invalid('README.md')

  let referenceCount = 0
  const files = ordered.map((candidate): ResolvedDocumentationFile => {
    const identity = validateRoute(candidate.path, extension)
    if (candidate.kind === 'markdown') {
      if (
        candidate.path.startsWith('assets/') ||
        candidate.mediaType !== 'text/markdown' ||
        typeof candidate.content !== 'string' ||
        byteLength(candidate.content) > MAX_MARKDOWN_BYTES ||
        containsTerminalControlCharacters(candidate.content)
      )
        invalid(candidate.path)
      const references = markdownReferences(candidate.content, candidate.path)
      referenceCount += references.length
      if (referenceCount > MAX_REFERENCES) invalid(candidate.path)
      for (const reference of references)
        validateReference(reference, candidate.path, seen)
      const frontmatter = parseFrontmatter(candidate.content, candidate.path)
      return Object.freeze({
        path: candidate.path,
        kind: 'markdown' as const,
        mediaType: 'text/markdown' as const,
        content: candidate.content,
        ...(frontmatter === undefined ? {} : { frontmatter }),
        ...(identity === undefined ? {} : { definition: identity }),
      })
    }
    if (
      typeof candidate.content === 'string' ||
      candidate.content.byteLength > MAX_ASSET_BYTES ||
      !candidate.path.startsWith('assets/')
    )
      invalid(candidate.path)
    const detected = inferredAssetType(candidate.content)
    const expected = expectedAssetType(candidate.path)
    if (
      detected === undefined ||
      expected === undefined ||
      detected !== expected ||
      candidate.mediaType !== detected
    )
      invalid(candidate.path)
    return Object.freeze({
      path: candidate.path,
      kind: 'asset' as const,
      mediaType: detected,
      content: candidate.content.slice(),
    })
  })
  return Object.freeze({
    index: 'README.md' as const,
    files: Object.freeze(files),
  })
}

function virtualCandidates(
  declaration: DocumentationDeclaration,
): readonly CandidateFile[] {
  if (
    !isRecord(declaration) ||
    declaration.kind !== 'virtual' ||
    !hasExactKeys(
      declaration,
      ['kind', 'index', 'files'],
      ['kind', 'index', 'files'],
    ) ||
    declaration.index !== 'README.md' ||
    !Array.isArray(declaration.files)
  )
    invalid('docs')
  return declaration.files.map((file: unknown) => {
    if (!isRecord(file) || typeof file.path !== 'string') invalid('docs')
    if (
      file.kind === 'markdown' &&
      hasExactKeys(
        file,
        ['path', 'kind', 'content', 'mediaType'],
        ['path', 'kind', 'content', 'mediaType'],
      ) &&
      typeof file.content === 'string' &&
      file.mediaType === 'text/markdown'
    )
      return file as unknown as CandidateFile
    if (
      file.kind === 'asset' &&
      hasExactKeys(
        file,
        ['path', 'kind', 'content', 'mediaType'],
        ['path', 'kind', 'content', 'mediaType'],
      ) &&
      file.content instanceof Uint8Array &&
      typeof file.mediaType === 'string'
    )
      return file as unknown as CandidateFile
    return invalid(file.path)
  })
}

async function directoryCandidates(
  declaration: DocumentationDeclaration,
  definitionModuleUrl: URL | undefined,
): Promise<readonly CandidateFile[]> {
  if (
    !isRecord(declaration) ||
    declaration.kind !== 'directory' ||
    !hasExactKeys(declaration, ['kind', 'path'], ['kind', 'path']) ||
    declaration.path !== './docs' ||
    definitionModuleUrl === undefined ||
    definitionModuleUrl.protocol !== 'file:'
  )
    invalid('docs')
  const root = fileURLToPath(new URL('./docs/', definitionModuleUrl))
  let rootStat: Stats
  try {
    rootStat = await lstat(root)
  } catch {
    return invalid('docs')
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) invalid('docs')
  const candidates: CandidateFile[] = []

  async function visit(physical: string, logical: string): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(physical)
    } catch {
      return invalid(logical || 'docs')
    }
    entries.sort(compareUnicodeCodePoints)
    for (const name of entries) {
      const path = logical.length === 0 ? name : `${logical}/${name}`
      validateLogicalPath(path)
      const physicalPath = join(physical, name)
      let info: Stats
      try {
        info = await lstat(physicalPath)
      } catch {
        return invalid(path)
      }
      if (info.isSymbolicLink()) invalid(path)
      if (info.isDirectory()) {
        await visit(physicalPath, path)
        continue
      }
      if (!info.isFile()) invalid(path)
      if (candidates.length >= MAX_FILES) invalid(path)
      const markdown = path.endsWith('.md')
      const limit = markdown ? MAX_MARKDOWN_BYTES : MAX_ASSET_BYTES
      if (info.size > limit || info.size > MAX_TOTAL_BYTES) invalid(path)
      const bytes = new Uint8Array(await readFile(physicalPath))
      if (markdown) {
        candidates.push({
          path,
          kind: 'markdown',
          mediaType: 'text/markdown',
          content: decodeMarkdown(bytes, path),
        })
      } else {
        const mediaType = inferredAssetType(bytes)
        if (mediaType === undefined) invalid(path)
        candidates.push({ path, kind: 'asset', mediaType, content: bytes })
      }
    }
  }
  await visit(root, '')
  return candidates
}

const definitionsWithoutDocumentation = new WeakMap<
  AnyExtensionDefinition,
  AnyExtensionDefinition
>()

function withoutDocumentation(
  extension: AnyExtensionDefinition,
): AnyExtensionDefinition {
  if (!Object.hasOwn(extension, 'docs')) return extension
  const cached = definitionsWithoutDocumentation.get(extension)
  if (cached !== undefined) return cached
  const { docs: _documentation, ...definition } = extension
  const resolved = definition as AnyExtensionDefinition
  definitionsWithoutDocumentation.set(extension, resolved)
  return resolved
}

export async function resolveExtensionDocumentation(
  extension: AnyExtensionDefinition,
  definitionModuleUrl?: URL,
): Promise<ResolvedExtensionDocumentation> {
  const declaration = extension.docs
  const definition = withoutDocumentation(extension)
  if (declaration === undefined) return { definition }
  const candidates =
    declaration.kind === 'directory'
      ? await directoryCandidates(declaration, definitionModuleUrl)
      : virtualCandidates(declaration)
  return {
    definition,
    documentation: normalizeCandidates(candidates, definition),
  }
}

export async function resolveCollectedExtensionDocumentation(
  collected: CollectedExtension,
  definitionModuleUrl?: URL,
): Promise<CollectedExtension> {
  const resolved = await resolveExtensionDocumentation(
    collected.definition,
    definitionModuleUrl,
  )
  return {
    definition: resolved.definition,
    provenance: collected.provenance,
    ...(resolved.documentation === undefined
      ? {}
      : { documentation: resolved.documentation }),
  }
}

function generatedMetadata(
  extension: AnyExtensionDefinition,
): readonly DocumentationProjectionItem[] {
  const extensionId = extension.id
  const providerDefinitions = new Map(
    [
      ...extension.providers,
      ...extension.oauthApps.map((app) => app.provider),
      ...extension.adapters.flatMap((adapter) =>
        adapter.provider === undefined ? [] : [adapter.provider],
      ),
    ].map((provider) => [provider.id, provider] as const),
  )
  const profileDefinitions = new Map(
    [
      ...extension.profiles,
      ...extension.adapters.flatMap((adapter) => adapter.profiles),
    ].map((profile) => [`${profile.id}@${profile.version}`, profile] as const),
  )
  const providers = [...providerDefinitions.values()]
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .map((provider): DocumentationProjectionItem => {
      const auth = provider.auth as unknown as Record<string, unknown>
      const generatedAuth =
        auth.kind === 'oauth2'
          ? {
              kind: 'oauth2',
              authorizationUrl: auth.authorizationUrl,
              tokenUrl: auth.tokenUrl,
              allowedHosts: [
                ...((auth.allowedHosts as readonly string[]) ?? []),
              ].sort(compareUnicodeCodePoints),
              baseScopes: [
                ...((auth.baseScopes as readonly string[]) ?? []),
              ].sort(compareUnicodeCodePoints),
              registration: {
                type: (auth.registration as Record<string, unknown>).type,
                configSchema: jsonSchema(
                  (auth.registration as Record<string, unknown>)
                    .configSchema as z.ZodTypeAny,
                ),
              },
            }
          : { kind: 'none' }
      return Object.freeze({
        extensionId,
        path: `generated/providers/${provider.id}.json`,
        origin: 'generated' as const,
        kind: 'metadata' as const,
        mediaType: 'application/json' as const,
        definition: Object.freeze({
          kind: 'provider' as const,
          id: provider.id,
        }),
        content: JSON.stringify({ id: provider.id, auth: generatedAuth }),
      })
    })
  const adapters = [
    ...new Map(
      extension.adapters.map((adapter) => [adapter.id, adapter] as const),
    ).values(),
  ]
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
    .map(
      (adapter): DocumentationProjectionItem =>
        Object.freeze({
          extensionId,
          path: `generated/adapters/${adapter.id}.json`,
          origin: 'generated' as const,
          kind: 'metadata' as const,
          mediaType: 'application/json' as const,
          definition: Object.freeze({
            kind: 'adapter' as const,
            id: adapter.id,
          }),
          content: JSON.stringify({
            id: adapter.id,
            ...(adapter.provider === undefined
              ? {}
              : { providerId: adapter.provider.id }),
            profiles: adapter.profiles
              .map(({ id, version }) => ({ id, version }))
              .sort((left, right) =>
                compareUnicodeCodePoints(
                  `${left.id}@${left.version}`,
                  `${right.id}@${right.version}`,
                ),
              ),
            routing: adapter.routing,
            capabilities: [...adapter.capabilities].sort(
              compareUnicodeCodePoints,
            ),
            configSchema: jsonSchema(adapter.configSchema),
            actions: Object.entries(adapter.actions)
              .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
              .map(([id, action]) => ({
                id,
                profile: {
                  id: action.profile.id,
                  version: action.profile.version,
                },
                input: jsonSchema(action.input),
                output: {
                  id: action.output.id,
                  version: action.output.version,
                },
              })),
          }),
        }),
    )
  const profiles = [...profileDefinitions.values()]
    .sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.id}@${left.version}`,
        `${right.id}@${right.version}`,
      ),
    )
    .map(
      (profile): DocumentationProjectionItem =>
        Object.freeze({
          extensionId,
          path: `generated/profiles/${profile.id}@${profile.version}.json`,
          origin: 'generated' as const,
          kind: 'metadata' as const,
          mediaType: 'application/json' as const,
          definition: Object.freeze({
            kind: 'profile' as const,
            id: profile.id,
            version: profile.version,
          }),
          content: JSON.stringify({
            id: profile.id,
            version: profile.version,
            schema: jsonSchema(profile.schema),
            fields: Object.keys(profile.search?.fields ?? {}).sort(
              compareUnicodeCodePoints,
            ),
            exports: Object.entries(profile.exports ?? {})
              .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
              .map(([id, value]) => ({ id, mediaType: value.mediaType })),
            actions: Object.entries(profile.actions ?? {})
              .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
              .map(([id, action]) => ({
                id,
                effect: action.effect,
                input: jsonSchema(action.input),
                output: action.output,
              })),
          }),
        }),
    )
  return [...providers, ...adapters, ...profiles]
}

function jsonSchema(schema: z.ZodTypeAny): object {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
  } catch {
    return {}
  }
}

function copyProjectionItem(
  item: DocumentationProjectionItem,
): DocumentationProjectionItem {
  return item.kind === 'asset'
    ? { ...item, content: (item.content as Uint8Array).slice() }
    : item
}

function documentationFingerprint(
  documentation: ResolvedDocumentationTree | undefined,
): string {
  if (documentation === undefined) return 'none'
  return JSON.stringify(
    documentation.files.map((file) => ({
      path: file.path,
      kind: file.kind,
      mediaType: file.mediaType,
      content:
        typeof file.content === 'string'
          ? file.content
          : Array.from(file.content),
      ...('frontmatter' in file && file.frontmatter !== undefined
        ? { frontmatter: file.frontmatter }
        : {}),
    })),
  )
}

export function assertCompatibleExtensionDocumentation(
  roots: readonly CollectedExtension[],
): void {
  const fingerprints = new Map<string, string>()
  for (const root of roots) {
    const fingerprint = documentationFingerprint(root.documentation)
    const prior = fingerprints.get(root.definition.id)
    if (prior !== undefined && prior !== fingerprint) {
      throw createExtensionHostDiagnostic('Conflicting Extension documentation')
    }
    fingerprints.set(root.definition.id, fingerprint)
  }
}

export function createDocumentationProjection(
  roots: readonly CollectedExtension[],
): DocumentationProjection {
  assertCompatibleExtensionDocumentation(roots)
  const authored: DocumentationProjectionItem[] = []
  const exactProfiles = new Map<
    string,
    Array<{ extensionId: string; item: DocumentationProjectionItem }>
  >()
  const generated: DocumentationProjectionItem[] = []
  const projectedExtensions = new Set<string>()

  for (const root of roots) {
    if (projectedExtensions.has(root.definition.id)) continue
    projectedExtensions.add(root.definition.id)
    generated.push(...generatedMetadata(root.definition))
    for (const file of root.documentation?.files ?? []) {
      const item = Object.freeze({
        extensionId: root.definition.id,
        path: file.path,
        origin: 'authored' as const,
        kind: file.kind,
        mediaType: file.mediaType,
        content: file.content,
        ...(file.kind === 'markdown' && file.frontmatter !== undefined
          ? { frontmatter: file.frontmatter }
          : {}),
        ...('definition' in file && file.definition !== undefined
          ? { definition: file.definition }
          : {}),
      }) satisfies DocumentationProjectionItem
      authored.push(item)
      if (item.definition?.kind === 'profile') {
        const matches = exactProfiles.get(item.definition.id) ?? []
        matches.push({ extensionId: root.definition.id, item })
        exactProfiles.set(item.definition.id, matches)
      }
    }
  }

  for (const matches of exactProfiles.values()) {
    if (matches.length !== 1) continue
    const { extensionId, item } = matches[0] as {
      extensionId: string
      item: DocumentationProjectionItem
    }
    const definition = item.definition as Extract<
      DocumentationDefinitionIdentity,
      { kind: 'profile' }
    >
    authored.push(
      Object.freeze({
        ...item,
        extensionId,
        path: `profiles/${definition.id}.md`,
        aliasOf: item.path,
      }),
    )
  }

  const items = Object.freeze(
    [...authored, ...generated].sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.extensionId}\0${left.path}\0${left.origin}`,
        `${right.extensionId}\0${right.path}\0${right.origin}`,
      ),
    ),
  )
  const byKey = new Map(
    items.map((item) => [`${item.extensionId}\0${item.path}`, item] as const),
  )
  return Object.freeze({
    list: () => Object.freeze(items.map(copyProjectionItem)),
    get: (extensionId: string, path: string) => {
      const item = byKey.get(`${extensionId}\0${path}`)
      return item === undefined ? undefined : copyProjectionItem(item)
    },
  })
}
