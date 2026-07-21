# Search Routing Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/extension-sdk — remote search contracts

```ts
export interface SearchRemoteQuery {
  readonly text: string
  readonly limit: number
  readonly continuation?: string
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
  readonly continuation?: string
}

export interface SearchContext extends ProviderContext {
  readonly query: SearchRemoteQuery
  readonly signal: AbortSignal
}
```

### @ctxindex/core — local search contracts

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

### @ctxindex/core — search preflight

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

### @ctxindex/core — search planning

```ts
export interface SearchPlannerInput {
  readonly text?: string
  readonly limit?: number
  readonly offset?: number
  readonly continuation?: string
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

export interface RemoteSearchPagination {
  readonly limit: number
  readonly hasMore: boolean
  readonly continuation: string | null
}

export interface SearchPlannerResult {
  readonly results: readonly UnifiedSearchResult[]
  readonly warnings: readonly SearchPlannerWarning[]
  readonly pagination?: SearchPagination | RemoteSearchPagination
  readonly explain?: { readonly sources: readonly SourceSearchExplain[] }
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

### @ctxindex/core — local search execution

```ts
export class LocalSearchExecutor {
  constructor(
      private readonly db: CtxindexDatabase,
      private readonly profiles: ProfileRegistry,
    );
  search(query: LocalSearchQuery): readonly LocalSearchResult[];
}
```

### @ctxindex/core — remote search execution

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

### @ctxindex/core — query normalization

```ts
export function sanitizeQuery(raw: string): {
  strict: string
  relaxed: string
};
```

## Implementation doctrine

Core search owns query normalization, Source selection, routing plans, local execution, merge, pagination, warnings, and explain output. Adapters receive only normalized remote queries and return provider-ranked envelope Resources.

Opaque remote continuation stays provider-neutral across the SDK, core, and CLI. The planner accepts continuation only for an explicit remote execution selecting one exact Source, passes the cursor through without decoding it, and projects the Adapter's next cursor as `{ limit, hasMore, continuation }`. Local execution keeps `{ offset, limit, hasMore }` unchanged. Multi-Source provider interleaving has no global cursor because advancing independent provider rankings after a bounded merge could discard unreturned results. When an Adapter returns a `truncated` warning but that invocation cannot expose its continuation, the planner replaces only the unusable resume sentence with provider-neutral guidance to rerun the unchanged search against the warning's exact Source id; exact-Source warning and continuation behavior remains unchanged.

The planner applies exact Realm/Source filters before execution, chooses local/remote legs from CLI, compatible Source overrides, Adapter routing, and indexed coverage, and preserves local results when an Extension or provider fails. It round-robin interleaves independent origin rankings and deduplicates by Ref; unrelated scores are never compared.

Remote execution post-filters and Ref-deduplicates one Adapter result before asking `ResourceStore.upsertMany()` to materialize that origin as a single optional cache batch. Exhausted storage contention becomes one safe `storage_busy` origin warning while the verified provider Resources remain available. After a synchronous successful or exhausted storage wait, execution yields one event-loop turn before its signal check so a scheduled operation abort takes precedence; non-contention storage failures remain terminal.

## Verification

Planner tests cover routing precedence, exact filters, hybrid coverage, degradation, interleaving, deduplication, explain output, query-less remote execution, exact-Source continuation, truthful multi-Source truncation guidance, and invalid pagination combinations before provider I/O. Local-search tests cover FTS, typed filters, deterministic enumeration, and offset pagination. Adapter tests cover provider query translation and cursor lifecycle. Focused remote tests preserve continuation through Profile verification/cache materialization and schedule cancellation during both successful and exhausted storage waits. Compiled CLI e2e tests verify exact-Source remote continuation plus atomic, deduplicated projections.
