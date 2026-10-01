import type { AnyAdapterDefinition } from './adapter'
import type { DocumentationDeclaration } from './documentation'
import type { AnyOAuthAppDefinition } from './oauth-app'
import type { AnyProfileDefinition } from './profile'
import type { AnyProviderDefinition } from './provider'

export interface ExtensionDefinition<
  TId extends string = string,
  TProviders extends
    readonly AnyProviderDefinition[] = readonly AnyProviderDefinition[],
  TOAuthApps extends
    readonly AnyOAuthAppDefinition[] = readonly AnyOAuthAppDefinition[],
  TProfiles extends
    readonly AnyProfileDefinition[] = readonly AnyProfileDefinition[],
  TAdapters extends
    readonly AnyAdapterDefinition[] = readonly AnyAdapterDefinition[],
  TDocs extends DocumentationDeclaration | undefined =
    | DocumentationDeclaration
    | undefined,
> {
  readonly kind: 'extension'
  readonly id: TId
  readonly providers: TProviders
  readonly oauthApps: TOAuthApps
  readonly profiles: TProfiles
  readonly adapters: TAdapters
  readonly docs?: TDocs
}

export type AnyExtensionDefinition = ExtensionDefinition

export function defineExtension<
  const TId extends string,
  const TProviders extends readonly AnyProviderDefinition[] = readonly [],
  const TOAuthApps extends readonly AnyOAuthAppDefinition[] = readonly [],
  const TProfiles extends readonly AnyProfileDefinition[] = readonly [],
  const TAdapters extends readonly AnyAdapterDefinition[] = readonly [],
  const TDocs extends DocumentationDeclaration | undefined = undefined,
>(definition: {
  readonly id: TId
  readonly providers?: TProviders
  readonly oauthApps?: TOAuthApps
  readonly profiles?: TProfiles
  readonly adapters?: TAdapters
  readonly docs?: TDocs
}): ExtensionDefinition<
  TId,
  TProviders,
  TOAuthApps,
  TProfiles,
  TAdapters,
  TDocs
> {
  return {
    ...definition,
    kind: 'extension',
    providers: definition.providers ?? ([] as unknown as TProviders),
    oauthApps: definition.oauthApps ?? ([] as unknown as TOAuthApps),
    profiles: definition.profiles ?? ([] as unknown as TProfiles),
    adapters: definition.adapters ?? ([] as unknown as TAdapters),
  }
}

const CATALOG_MAX_ENTRIES = 256
const DEFINITION_ID_MAX_LENGTH = 128
const DEFINITION_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u

export type ExtensionPackageTarget =
  | { readonly kind: 'npm'; readonly target: string }
  | { readonly kind: 'git'; readonly target: string }
  | { readonly kind: 'local'; readonly target: string }

export interface PackageExtensionDescriptor<
  TTarget extends ExtensionPackageTarget = ExtensionPackageTarget,
  TExtensionId extends string = string,
> {
  readonly kind: 'package-extension'
  readonly source: TTarget
  readonly extensionId: TExtensionId
}

export type CatalogEntry = AnyExtensionDefinition | PackageExtensionDescriptor

export type CatalogEntryId<TEntry extends CatalogEntry> =
  TEntry extends ExtensionDefinition<infer TId>
    ? TId
    : TEntry extends PackageExtensionDescriptor<
          ExtensionPackageTarget,
          infer TId
        >
      ? TId
      : never

export type CatalogEntrySummaries<TEntries extends readonly CatalogEntry[]> =
  Readonly<Partial<Record<CatalogEntryId<TEntries[number]>, string>>>

export interface CatalogDefinition<
  TId extends string = string,
  TEntries extends readonly CatalogEntry[] = readonly CatalogEntry[],
> {
  readonly kind: 'catalog'
  readonly id: TId
  readonly label: string
  readonly summary?: string
  readonly entrySummaries?: CatalogEntrySummaries<TEntries>
  readonly extensions: TEntries
}

export type AnyCatalogDefinition = CatalogDefinition

function invalidCatalog(message: string): never {
  throw new TypeError(message)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value)
  return (
    actual.length === keys.length && actual.every((key) => keys.includes(key))
  )
}

function validateStableId(id: unknown, label: string): asserts id is string {
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > DEFINITION_ID_MAX_LENGTH ||
    !DEFINITION_ID_PATTERN.test(id)
  ) {
    invalidCatalog(`Invalid ${label} id`)
  }
}

function validateTarget(
  source: unknown,
): asserts source is ExtensionPackageTarget {
  if (
    !isPlainRecord(source) ||
    !hasExactKeys(source, ['kind', 'target']) ||
    (source.kind !== 'npm' &&
      source.kind !== 'git' &&
      source.kind !== 'local') ||
    typeof source.target !== 'string' ||
    source.target.length === 0 ||
    source.target.trim() !== source.target ||
    source.target.includes('\0')
  ) {
    invalidCatalog('Invalid Extension package source')
  }
}

function catalogEntryId(entry: unknown): string {
  if (!isPlainRecord(entry)) invalidCatalog('Invalid Catalog Extension entry')

  if (entry.kind === 'extension') {
    validateStableId(entry.id, 'Catalog Extension')
    if (
      'version' in entry ||
      !Array.isArray(entry.providers) ||
      !Array.isArray(entry.oauthApps) ||
      !Array.isArray(entry.profiles) ||
      !Array.isArray(entry.adapters)
    ) {
      invalidCatalog('Invalid Catalog Extension entry')
    }
    return entry.id
  }

  if (
    entry.kind === 'package-extension' &&
    hasExactKeys(entry, ['kind', 'source', 'extensionId'])
  ) {
    validateTarget(entry.source)
    validateStableId(entry.extensionId, 'Catalog Extension')
    return entry.extensionId
  }

  invalidCatalog('Invalid Catalog Extension entry')
}

export function packageExtension<
  const TTarget extends ExtensionPackageTarget,
  const TExtensionId extends string,
>(
  source: TTarget,
  extensionId: TExtensionId,
): PackageExtensionDescriptor<TTarget, TExtensionId> {
  validateTarget(source)
  validateStableId(extensionId, 'Catalog Extension')
  return { kind: 'package-extension', source, extensionId }
}

export function defineCatalog<
  const TId extends string,
  const TEntries extends readonly CatalogEntry[],
  const TEntrySummaries extends Readonly<Record<string, string>> = Readonly<
    Record<never, string>
  >,
>(definition: {
  readonly id: TId
  readonly label: string
  readonly summary?: string
  readonly entrySummaries?: TEntrySummaries &
    Readonly<
      Record<
        Exclude<
          keyof TEntrySummaries,
          CatalogEntryId<NoInfer<TEntries>[number]>
        >,
        never
      >
    >
  readonly extensions: TEntries
}): CatalogDefinition<TId, TEntries> {
  if (!isPlainRecord(definition)) invalidCatalog('Invalid Catalog definition')
  validateStableId(definition.id, 'Catalog')
  if (
    typeof definition.label !== 'string' ||
    definition.label.length === 0 ||
    definition.label.trim() !== definition.label ||
    (definition.summary !== undefined &&
      typeof definition.summary !== 'string') ||
    !Array.isArray(definition.extensions)
  ) {
    invalidCatalog('Invalid Catalog definition')
  }
  if (definition.extensions.length > CATALOG_MAX_ENTRIES) {
    invalidCatalog('A Catalog may contain at most 256 direct entries')
  }

  const ids = new Set<string>()
  for (const entry of definition.extensions) {
    const id = catalogEntryId(entry)
    if (ids.has(id)) invalidCatalog(`Duplicate Catalog Extension id ${id}`)
    ids.add(id)
  }

  if (definition.entrySummaries !== undefined) {
    if (!isPlainRecord(definition.entrySummaries)) {
      invalidCatalog('Invalid Catalog Extension summaries')
    }
    for (const [id, summary] of Object.entries(definition.entrySummaries)) {
      if (!ids.has(id)) {
        invalidCatalog(`Unknown Catalog Extension summary ${id}`)
      }
      if (typeof summary !== 'string' || summary.length === 0) {
        invalidCatalog(`Invalid Catalog Extension summary ${id}`)
      }
    }
  }

  return { ...definition, kind: 'catalog' }
}
