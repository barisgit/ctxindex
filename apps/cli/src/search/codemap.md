# apps/cli/src/search/

## Responsibility

Executes normalized Search requests across selected-daemon and direct `SearchPlanner` paths.

## Design / patterns

- `commands/search.ts` binds the reusable Citty definition from `args/search.ts`, normalizes typed parsed values, and passes one `ResolvedSearchArgs` value to `handleSearchCommand`.
- `handleSearchCommand` consumes semantic input rather than raw argv. It resolves direct Source labels only in direct mode; selected-daemon mode forwards the normalized filters without opening SQLite.
- Realm, Source, and field repetition is resolved before the handler, preserving caller order. Local offsets and exact-Source remote continuations retain their distinct planner semantics.
- JSON, Ref-only, readable result, warning, pagination, and explain output remain presentation concerns here, with `SIGINT` propagated through the request abort signal.

## Data & control flow

Citty parses the Search definition, `resolveSearchArgs` validates and constructs `ExecuteSearchInput`, then the handler selects daemon RPC or direct dependencies. Direct Source selectors resolve to stable IDs before `SearchPlanner.search`; results are formatted to stdout and warnings/explain data to stderr.

## Integration points

Called by `commands/search.ts`; uses `args/search.ts`, the daemon client, `SearchPlanner`, direct dependency composition, and stable exit mapping.
