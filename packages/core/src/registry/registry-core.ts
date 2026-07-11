import { CtxindexRegistryError } from './errors'
import type { CtxindexAdapterRegistryHandle } from './handle'
import type {
  AdapterMigrations,
  AdapterProvider,
  SourceAdapterDefinition,
  SourceKind,
  SyncMode,
} from './types'

type OAuth2Provider = 'google' | 'microsoft'

type RegistryIndex = {
  readonly byId: ReadonlyMap<string, SourceAdapterDefinition>
  readonly byNamespace: ReadonlyMap<string, SourceAdapterDefinition>
  readonly byProvider: ReadonlyMap<
    AdapterProvider,
    readonly SourceAdapterDefinition[]
  >
  readonly byKind: ReadonlyMap<SourceKind, readonly SourceAdapterDefinition[]>
  readonly oauth2: readonly SourceAdapterDefinition[]
  readonly oauth2ByProvider: ReadonlyMap<
    OAuth2Provider,
    readonly SourceAdapterDefinition[]
  >
  readonly providers: readonly AdapterProvider[]
  readonly namespaces: readonly string[]
  readonly migrations: readonly AdapterMigrations[]
}

function appendIndexed<K>(
  index: Map<K, SourceAdapterDefinition[]>,
  key: K,
  adapter: SourceAdapterDefinition,
) {
  const existing = index.get(key)
  if (existing) {
    existing.push(adapter)
    return
  }
  index.set(key, [adapter])
}

function freezeIndexed<K>(
  index: Map<K, SourceAdapterDefinition[]>,
): ReadonlyMap<K, readonly SourceAdapterDefinition[]> {
  const frozen = new Map<K, readonly SourceAdapterDefinition[]>()
  for (const [key, value] of index) {
    frozen.set(key, Object.freeze([...value]))
  }
  return frozen
}

function buildIndex(
  adapters: readonly SourceAdapterDefinition[],
): RegistryIndex {
  const byId = new Map<string, SourceAdapterDefinition>()
  const byNamespace = new Map<string, SourceAdapterDefinition>()
  const byProvider = new Map<AdapterProvider, SourceAdapterDefinition[]>()
  const byKind = new Map<SourceKind, SourceAdapterDefinition[]>()
  const oauth2: SourceAdapterDefinition[] = []
  const oauth2ByProvider = new Map<OAuth2Provider, SourceAdapterDefinition[]>()

  for (const adapter of adapters) {
    byId.set(adapter.id, adapter)
    byNamespace.set(adapter.migrations.namespace, adapter)
    appendIndexed(byProvider, adapter.provider, adapter)
    for (const kind of adapter.capabilities.kinds) {
      appendIndexed(byKind, kind, adapter)
    }
    if (adapter.auth.kind === 'oauth2') {
      oauth2.push(adapter)
      appendIndexed(oauth2ByProvider, adapter.auth.provider, adapter)
    }
  }

  return {
    byId,
    byNamespace,
    byProvider: freezeIndexed(byProvider),
    byKind: freezeIndexed(byKind),
    oauth2: Object.freeze([...oauth2]),
    oauth2ByProvider: freezeIndexed(oauth2ByProvider),
    providers: Object.freeze([...byProvider.keys()]),
    namespaces: Object.freeze(
      adapters.map((adapter) => adapter.migrations.namespace),
    ),
    migrations: Object.freeze(adapters.map((adapter) => adapter.migrations)),
  }
}

function getIndexed<T>(
  map: ReadonlyMap<string, T>,
  key: string,
): T | undefined {
  return map.get(key)
}

function requireNonEmptyAdapterIds<AdapterId extends string>(
  ids: AdapterId[],
): readonly [AdapterId, ...AdapterId[]] {
  const first = ids[0]
  if (first === undefined) {
    throw new CtxindexRegistryError(
      'At least one adapter is required.',
      'registry_mode_required',
      { requirement: 'non_empty_adapter_catalog' },
    )
  }
  return Object.freeze([first, ...ids.slice(1)])
}

function assertSearchCapability(
  id: string,
  def: Pick<SourceAdapterDefinition, 'searchMode' | 'search'>,
) {
  if (def.searchMode !== 'indexed' && typeof def.search !== 'function') {
    throw new CtxindexRegistryError(
      `Adapter "${id}" declares searchMode "${def.searchMode}" but provides no search function.`,
      'registry_search_capability_missing',
      { adapterId: id, searchMode: def.searchMode },
    )
  }
}

export function createSourceAdapter<
  TId extends string,
  TDef extends Omit<SourceAdapterDefinition, 'id'>,
>(id: TId, def: TDef): TDef & { readonly id: TId } {
  assertSearchCapability(id, def)
  return Object.freeze({ id, ...def }) as TDef & { readonly id: TId }
}

export function createCtxindexAdapterRegistry<
  const TAdapters extends Record<string, SourceAdapterDefinition>,
>(adapters: TAdapters): CtxindexAdapterRegistryHandle<TAdapters> {
  type AdapterId = Extract<keyof TAdapters, string>

  const catalog = Object.freeze({ ...adapters }) as TAdapters
  const adapterIds = requireNonEmptyAdapterIds(
    Object.keys(catalog) as AdapterId[],
  )
  const catalogEntries: SourceAdapterDefinition[] = []
  for (const id of adapterIds) {
    const adapter = catalog[id]
    if (!adapter) {
      throw new CtxindexRegistryError(
        `Unknown adapter "${id}" while building registry catalog.`,
        'registry_unknown_adapter',
        { adapterId: id, known: adapterIds },
      )
    }
    catalogEntries.push(adapter)
  }
  const catalogIndex = buildIndex(catalogEntries)

  const overlay = new Map<string, SourceAdapterDefinition>()
  const overlayByNamespace = new Map<string, SourceAdapterDefinition>()
  const overlayByProvider = new Map<
    AdapterProvider,
    SourceAdapterDefinition[]
  >()
  const overlayByKind = new Map<SourceKind, SourceAdapterDefinition[]>()
  const overlayOAuth2: SourceAdapterDefinition[] = []
  const overlayOAuth2ByProvider = new Map<
    OAuth2Provider,
    SourceAdapterDefinition[]
  >()

  function resolve(id: string): SourceAdapterDefinition | undefined {
    return overlay.get(id) ?? getIndexed(catalogIndex.byId, id)
  }

  function unknownAdapter(id: string): CtxindexRegistryError {
    return new CtxindexRegistryError(
      `Unknown adapter "${id}". Known: ${adapterIds.join(', ')}.`,
      'registry_unknown_adapter',
      { adapterId: id, known: adapterIds },
    )
  }

  function requireAdapter(id: string): SourceAdapterDefinition {
    const adapter = resolve(id)
    if (!adapter) {
      throw unknownAdapter(id)
    }
    return adapter
  }

  function removeFromOverlayIndexes(adapter: SourceAdapterDefinition) {
    overlayByNamespace.delete(adapter.migrations.namespace)
    removeIndexed(overlayByProvider, adapter.provider, adapter.id)
    for (const kind of adapter.capabilities.kinds) {
      removeIndexed(overlayByKind, kind, adapter.id)
    }
    if (adapter.auth.kind === 'oauth2') {
      removeArrayValue(overlayOAuth2, adapter.id)
      removeIndexed(overlayOAuth2ByProvider, adapter.auth.provider, adapter.id)
    }
  }

  function addToOverlayIndexes(adapter: SourceAdapterDefinition) {
    overlayByNamespace.set(adapter.migrations.namespace, adapter)
    appendIndexed(overlayByProvider, adapter.provider, adapter)
    for (const kind of adapter.capabilities.kinds) {
      appendIndexed(overlayByKind, kind, adapter)
    }
    if (adapter.auth.kind === 'oauth2') {
      overlayOAuth2.push(adapter)
      appendIndexed(overlayOAuth2ByProvider, adapter.auth.provider, adapter)
    }
  }

  function catalogIdsFor(
    adaptersForIndex: readonly SourceAdapterDefinition[],
  ): Set<string> {
    return new Set(adaptersForIndex.map((adapter) => adapter.id))
  }

  function resolveCatalogRows(
    adaptersForIndex: readonly SourceAdapterDefinition[],
    predicate: (adapter: SourceAdapterDefinition) => boolean,
  ): SourceAdapterDefinition[] {
    const rows: SourceAdapterDefinition[] = []
    for (const adapter of adaptersForIndex) {
      const resolved = resolve(adapter.id)
      if (resolved && predicate(resolved)) {
        rows.push(resolved)
      }
    }
    return rows
  }

  function withOverlayRows(
    catalogRows: readonly SourceAdapterDefinition[],
    overlayRows: readonly SourceAdapterDefinition[],
  ): readonly SourceAdapterDefinition[] {
    const catalogIds = catalogIdsFor(catalogRows)
    const rows = [...catalogRows]
    for (const adapter of overlayRows) {
      if (!catalogIds.has(adapter.id)) {
        rows.push(adapter)
      }
    }
    return Object.freeze(rows)
  }

  function isKnownAdapter(v: string): v is AdapterId {
    return resolve(v) !== undefined
  }

  function assertKnownAdapter(v: string): asserts v is AdapterId {
    if (!isKnownAdapter(v)) {
      throw unknownAdapter(v)
    }
  }

  function getAdapter<TId extends AdapterId>(id: TId): TAdapters[TId] {
    return requireAdapter(id) as TAdapters[TId]
  }

  function listAdapters(): readonly SourceAdapterDefinition[] {
    const catalogRows = adapterIds.map((id) => requireAdapter(id))
    return withOverlayRows(catalogRows, [...overlay.values()])
  }

  function listAdapterIds(): readonly AdapterId[] {
    return adapterIds
  }

  function getAdaptersByProvider(
    provider: AdapterProvider,
  ): readonly SourceAdapterDefinition[] {
    const catalogRows = resolveCatalogRows(
      catalogIndex.byProvider.get(provider) ?? [],
      (adapter) => adapter.provider === provider,
    )
    return withOverlayRows(catalogRows, overlayByProvider.get(provider) ?? [])
  }

  function getAdaptersByKind(
    kind: SourceKind,
  ): readonly SourceAdapterDefinition[] {
    const catalogRows = resolveCatalogRows(
      catalogIndex.byKind.get(kind) ?? [],
      (adapter) => adapter.capabilities.kinds.includes(kind),
    )
    return withOverlayRows(catalogRows, overlayByKind.get(kind) ?? [])
  }

  function listMigrations(): readonly AdapterMigrations[] {
    return Object.freeze(listAdapters().map((adapter) => adapter.migrations))
  }

  function getMigrations(id: AdapterId): AdapterMigrations {
    return requireAdapter(id).migrations
  }

  function getNamespaceForId(id: AdapterId): string {
    return getMigrations(id).namespace
  }

  function getAdapterForNamespace(
    namespace: string,
  ): SourceAdapterDefinition | undefined {
    return (
      overlayByNamespace.get(namespace) ??
      catalogIndex.byNamespace.get(namespace)
    )
  }

  function getSupportedModes(id: AdapterId): readonly SyncMode[] {
    return requireAdapter(id).capabilities.modes
  }

  function listOAuth2Adapters(): readonly SourceAdapterDefinition[] {
    const catalogRows = resolveCatalogRows(
      catalogIndex.oauth2,
      (adapter) => adapter.auth.kind === 'oauth2',
    )
    return withOverlayRows(catalogRows, overlayOAuth2)
  }

  function listOAuth2AdaptersByProvider(
    provider: OAuth2Provider,
  ): readonly SourceAdapterDefinition[] {
    const catalogRows = resolveCatalogRows(
      catalogIndex.oauth2ByProvider.get(provider) ?? [],
      (adapter) =>
        adapter.auth.kind === 'oauth2' && adapter.auth.provider === provider,
    )
    return withOverlayRows(
      catalogRows,
      overlayOAuth2ByProvider.get(provider) ?? [],
    )
  }

  return {
    adapters: catalog,
    adapterIds,
    providers: catalogIndex.providers,
    namespaces: catalogIndex.namespaces,
    isKnownAdapter,
    assertKnownAdapter,
    getAdapter,
    getLabel: (id) => requireAdapter(id).label,
    getProvider: (id) => requireAdapter(id).provider,
    listAdapters,
    listAdapterIds,
    getAdaptersByProvider,
    getAdaptersByKind,
    listMigrations,
    getMigrations,
    getNamespaceForId,
    getAdapterForNamespace,
    getCapabilities: (id) => requireAdapter(id).capabilities,
    getSupportedModes,
    supportsMode: (id, mode) => getSupportedModes(id).includes(mode),
    supportsResume: (id) => requireAdapter(id).capabilities.supportsResume,
    supportsAttachments: (id) =>
      requireAdapter(id).capabilities.supportsAttachments,
    supportsRawRecords: (id) =>
      requireAdapter(id).capabilities.supportsRawRecords,
    getSearchMode: (id) => requireAdapter(id).searchMode,
    getSearchFn: (id) => requireAdapter(id).search,
    listFederatedAdapters: () =>
      Object.freeze(
        listAdapters().filter((adapter) => adapter.searchMode !== 'indexed'),
      ),
    getSyncFn: (id) => requireAdapter(id).sync,
    getSchema: (id) => requireAdapter(id).schema,
    getConfigSchema: (id) => requireAdapter(id).configSchema,
    getAuthSpec: (id) => requireAdapter(id).auth,
    isOAuth2: (id) => requireAdapter(id).auth.kind === 'oauth2',
    listOAuth2Adapters,
    listOAuth2AdaptersByProvider,
    getRequiredScopes: (id) => {
      const auth = requireAdapter(id).auth
      return auth.kind === 'oauth2' ? auth.scopes : null
    },
    registerAdapter: (adapter) => {
      assertSearchCapability(adapter.id, adapter)
      const previous = overlay.get(adapter.id)
      if (previous) {
        removeFromOverlayIndexes(previous)
      }
      overlay.set(adapter.id, adapter)
      addToOverlayIndexes(adapter)
      return previous
    },
    unregisterAdapter: (id) => {
      const previous = overlay.get(id)
      if (!previous) {
        return undefined
      }
      overlay.delete(id)
      removeFromOverlayIndexes(previous)
      return previous
    },
  }
}

function removeArrayValue(adapters: SourceAdapterDefinition[], id: string) {
  const index = adapters.findIndex((adapter) => adapter.id === id)
  if (index >= 0) {
    adapters.splice(index, 1)
  }
}

function removeIndexed<K>(
  index: Map<K, SourceAdapterDefinition[]>,
  key: K,
  id: string,
) {
  const adapters = index.get(key)
  if (!adapters) {
    return
  }
  removeArrayValue(adapters, id)
  if (adapters.length === 0) {
    index.delete(key)
  }
}
