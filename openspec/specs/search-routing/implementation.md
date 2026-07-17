# Search Routing Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/extension-sdk/src/operations.ts`

```ts
export interface SearchRemoteQuery {
  readonly text: string
  readonly limit: number
  readonly since?: number
  readonly until?: number
  readonly fields?: readonly SearchFieldFilter[]
}

export interface SearchFieldFilter {
  readonly name: string
  readonly type: FieldType
  readonly value: string | number | boolean
}

export interface SearchRemoteResource<TPayload = unknown> {
  readonly ref: string
  readonly profile: ProfileReference
  readonly title?: string | null
  readonly summary?: string | null
  readonly occurredAt?: number | null
  readonly providerUpdatedAt?: number | null
  readonly payload?: TPayload
}

export interface SearchRemoteWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface SearchRemoteResult {
  readonly resources: readonly SearchRemoteResource[]
  readonly warnings: readonly SearchRemoteWarning[]
}

export interface SearchContext extends ProviderContext {
  readonly query: SearchRemoteQuery
  readonly signal: AbortSignal
}
```

### `packages/core/src/search/types.ts`

```ts
export interface LocalSearchFieldFilter {
  readonly name: string
  readonly value: string
}

export interface LocalSearchQuery {
  readonly text?: string
  readonly limit?: number
  readonly offset?: number
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
  readonly deleted?: 'exclude' | 'include' | 'only'
}

export interface LocalSearchChunk {
  readonly index: number
  readonly snippet: string
  readonly rank: number
}

export interface LocalSearchEvidence {
  readonly rank: number
  readonly indexPaths: readonly (
    | 'resources'
    | 'resources_fts'
    | 'chunks_fts'
    | 'field_index'
  )[]
}

export interface LocalSearchResult {
  readonly origin: 'local'
  readonly resourceOrigin: ResourceOrigin
  readonly ref: string
  readonly sourceId: string
  readonly realm: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly envelope: {
    readonly title: string | null
    readonly summary: string | null
    readonly occurredAt: number | null
    readonly deletedAt: number | null
  }
  readonly evidence: LocalSearchEvidence
  readonly chunks: readonly LocalSearchChunk[]
}
```

### `packages/core/src/search/preflight.ts`

```ts
export interface SearchPreflightInput {
  readonly text: string
  readonly limit: number
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
}

export interface ResolvedSearchQuery extends SearchRemoteQuery {
  readonly kind?: string
}

export function resolveSearchQuery(
  profiles: ProfileRegistry,
  input: SearchPreflightInput,
): ResolvedSearchQuery;
```

### `packages/core/src/search/planner.ts`

```ts
export interface SearchPlannerInput {
  readonly text?: string
  readonly limit?: number
  readonly offset?: number
  readonly realms?: readonly string[]
  readonly sourceIds?: readonly string[]
  readonly adapterId?: string
  readonly kind?: string
  readonly fields?: readonly LocalSearchFieldFilter[]
  readonly since?: number
  readonly until?: number
  readonly localOnly?: boolean
  readonly remote?: boolean
  readonly explain?: boolean
  readonly now?: number
  readonly timeoutMs?: number
}

export interface UnifiedSearchResult {
  readonly ref: string
  readonly profile: { readonly id: string; readonly version: number }
  readonly sourceId: string
  readonly origin: 'local' | 'provider'
  readonly originRank: number
  readonly title: string | null
  readonly summary: string | null
  readonly occurredAt: number | null
  readonly chunks: readonly {
    readonly index: number
    readonly snippet: string
  }[]
}

export interface SearchPlannerWarning {
  readonly sourceId: string
  readonly code: string
  readonly message: string
}

export interface SourceSearchExplain {
  readonly sourceId: string
  readonly routing: SearchRouting
  readonly decidedBy: 'cli' | 'source' | 'adapter' | 'unavailable'
  readonly legs: readonly ('local' | 'remote')[]
  readonly outcome:
    | 'success'
    | 'degraded'
    | 'unsupported'
    | 'extension_unavailable'
  readonly coverage: 'local' | 'remote' | 'local+remote'
}

export interface SearchPagination {
  readonly offset: number
  readonly limit: number
  readonly hasMore: boolean
}

export interface SearchPlannerResult {
  readonly results: readonly UnifiedSearchResult[]
  readonly warnings: readonly SearchPlannerWarning[]
  readonly pagination?: SearchPagination
  readonly explain?: { readonly sources: readonly SourceSearchExplain[] }
}

interface SourcePlanRow {
  readonly id: string
  readonly realm_slug: string
  readonly adapter_id: string
  readonly adapter_version: number
  readonly config_json: string
  readonly sync_enabled: number
  readonly search_routing: SearchRouting | null
  readonly last_status: string | null
  readonly last_run_status: string | null
}

interface PlannedSource {
  readonly row: SourcePlanRow
  readonly routing: SearchRouting
  readonly decidedBy: SourceSearchExplain['decidedBy']
  readonly legs: ('local' | 'remote')[]
  readonly coverage: SourceSearchExplain['coverage']
  readonly unavailable: boolean
}

export class SearchPlanner {
  readonly #local: LocalSearchExecutor
  constructor(
      private readonly deps: {
        readonly db: CtxindexDatabase
        readonly registry: ExtensionRegistry
        readonly authService: AuthService
        readonly logger: Logger
        readonly fetch?: typeof fetch
      },
    );
  async search(input: SearchPlannerInput): Promise<SearchPlannerResult>;
}
```

### `packages/core/src/search/local-search.ts`

```ts
export class LocalSearchExecutor {
  constructor(
      private readonly db: CtxindexDatabase,
      private readonly profiles: ProfileRegistry,
    );
  search(query: LocalSearchQuery): readonly LocalSearchResult[];
}
```

### `packages/core/src/source/remote-search.ts`

```ts
export interface SearchSourceRemoteInput
  extends CreateSourceProviderContextInput {
  readonly query: SearchRemoteQuery
  readonly signal: AbortSignal
}

export async function searchSourceRemote(
  input: SearchSourceRemoteInput,
): Promise<SearchRemoteResult>;
```

### `packages/core/src/search/sanitize.ts`

```ts
export function sanitizeQuery(raw: string): {
  strict: string
  relaxed: string
};
```

## Implementation doctrine

Core search owns query normalization, Source selection, routing plans, local execution, merge, pagination, warnings, and explain output. Adapters receive only normalized remote queries and return provider-ranked envelope Resources.

The planner applies exact Realm/Source filters before execution, chooses local/remote legs from CLI, compatible Source overrides, Adapter routing, and indexed coverage, and preserves local results when an Extension or provider fails. It round-robin interleaves independent origin rankings and deduplicates by Ref; unrelated scores are never compared.

## Verification

Planner tests cover routing precedence, exact filters, hybrid coverage, degradation, interleaving, deduplication, and explain output. Local-search tests cover FTS, typed filters, deterministic enumeration, and offset pagination. Adapter tests cover provider query translation.
