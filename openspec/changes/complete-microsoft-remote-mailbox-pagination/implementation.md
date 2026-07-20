## Capability Implementation Targets

- `search-routing` -> `openspec/specs/search-routing/implementation.md`
- `microsoft-graph-adapters` -> `openspec/specs/microsoft-graph-adapters/implementation.md`

## Module Ownership

`@ctxindex/extension-sdk` owns the provider-neutral optional continuation fields on remote search query/result contracts. `@ctxindex/core` owns validation of generic execution modes, exact Source selection, passing one opaque token to the Adapter, remote JSON pagination projection, Profile-backed post-filter verification, and ad-hoc Resource caching. The CLI remains a thin parser/help/output adapter and never recognizes Microsoft token contents.

`@ctxindex/adapters` remains the sole owner of Microsoft KQL construction, continuation serialization/validation, Graph next-link replay, immutable-id request preferences, Draft exclusion, and Graph message normalization. The Microsoft mailbox module may depend on core error classes through the existing Adapter pattern; core and CLI MUST NOT import Microsoft implementation modules or branch on `microsoft.mailbox`.

## Interfaces and Data Flow

The Extension SDK remote seam adds only optional opaque cursor fields:

```ts
export interface SearchRemoteQuery {
  readonly text: string
  readonly limit: number
  readonly since?: number
  readonly until?: number
  readonly fields?: readonly SearchFieldFilter[]
  readonly continuation?: string
}

export interface SearchRemoteResult {
  readonly resources: readonly SearchRemoteResource[]
  readonly warnings: readonly SearchRemoteWarning[]
  readonly continuation?: string
}
```

Core search input and result preserve the existing local pagination interface while adding a disjoint remote shape:

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
  readonly includeDeleted?: boolean
  readonly localOnly?: boolean
  readonly remote?: boolean
  readonly explain?: boolean
  readonly now?: number
  readonly timeoutMs?: number
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
```

The CLI parser normalizes one `--continuation` string and rejects structurally impossible mode combinations before opening dependencies. The planner resolves aliases to Source ids, enforces the exact-one-Source continuation boundary, passes the token through `ResolvedSearchQuery` and `searchSourceRemote()`, and projects the returned token without decoding it. `searchSourceRemote()` continues post-verifying Resources and atomically caching a deduplicated batch, then preserves the Adapter continuation in its result.

Microsoft mailbox search canonicalizes the exact Source id, normalized query identity, requested limit, supported Graph `$search`/`$filter` shape, and bounded 50-result invocation limit before any request. Match-all requests omit `$search`; unread-only enumeration uses `$filter=isRead eq <bool>`; combined text/KQL plus unread uses `$search` alone and exact local unread verification. An initial call builds the Graph URL; a resumed call parses a private versioned base64url JSON token containing the validated next link, exact Source id, exact query identity, requested limit, and bounded unique seen-id list. It rejects bad schema, wrong Source/query/limit, excessive ids, or foreign Graph progression before I/O. Page traversal sends the immutable-id header for every fetch, validates page size and payload, adds emitted ids to the token's seen set, excludes Drafts, unread mismatches, and already-seen ids, replays a partially consumed page when necessary to avoid silent loss, and returns the next token only after complete processing of each accepted page.

## Storage and State

No persistent state or schema is added. Continuation state is caller-held and opaque; core storage continues caching only verified partial Resources. The Microsoft token is bounded, versioned, Source-and-query-bound, and discarded when Graph returns no next link.

## Security and Compatibility

Continuation parsing and query mismatch failures occur before authentication or provider I/O where the CLI/core can decide them, and before Graph I/O inside the Adapter for token-specific validation. Every decoded next link crosses the existing Graph HTTPS host and `/v1.0/me/messages` path validator. Tokens contain no credentials and MUST never weaken provider-host egress enforcement or expose a provider-specific CLI option.

Local offset JSON and behavior remain byte-compatible. Existing queryful remote calls remain valid without continuation. There is no daemon contract on current main; a later daemon RPC implementation must carry the new generic `SearchPlannerInput.continuation` and pagination union unchanged rather than invent a provider-specific RPC field.

## Verification

SDK compile tests enforce optional scoreless continuation types. CLI argument tests cover query-less remote acceptance and every invalid offset/continuation combination. Planner tests prove local behavior unchanged, exact-one-Source continuation, generic pass-through, deterministic metadata, multi-Source omission, and zero remote calls on invalid input. Source remote tests prove continuation survives Profile verification/caching.

Microsoft Adapter tests cover omitted match-all `$search`, exact unread `$filter`, supported combined text/unread requests, malformed/Source/query-mismatched token zero I/O, the 50-result boundary, next-link replay, seen-id and Draft suppression, oversized/malformed pages, and immutable-id headers on every request. The loopback Graph mock rejects wildcard `$search`, `IsRead:` KQL, and combined message `$search`/`$filter`. Loopback CLI integration and relocated compiled e2e coverage prove two pages beyond 50 through only generic `search` flags and synthetic credentials. Architecture, skills guidance, full CI, strict OpenSpec, and independent review remain mandatory.

## Promotion Notes

- `openspec/specs/search-routing/implementation.md`: promote the optional SDK continuation fields, planner input and pagination union, exact-Source pass-through flow, local compatibility boundary, and focused verification doctrine.
- `openspec/specs/microsoft-graph-adapters/implementation.md`: promote the private bounded Source-and-query-bound token lifecycle, validated Graph replay and immutable-id flow, documented unread translation, and Adapter verification doctrine.
