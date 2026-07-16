# packages/core/src/schema/

## Responsibility

Declares the core SQLite relational model as Drizzle table definitions for identity/auth, Realms and Sources, indexed Resources, relations/artifacts, and sync bookkeeping.

## Design/patterns

- Each file owns one table or tightly coupled pair and exports a `sqliteTable` value; `index.ts` is the aggregate barrel.
- Foreign keys encode ownership and cleanup: account identities/grants follow `accounts`, source data follows `sources`, and chunks/artifacts/relations follow `resources`, commonly with `onDelete: 'cascade'`.
- Database invariants live beside columns through `check`, `unique`, composite `primaryKey`, and partial/indexed access paths; Accounts require an external user ID unique within each provider.
- Typed field search is normalized by `field_index.ts` into text/number/integer columns with checks ensuring exactly the native value column appropriate to `declaredType`.

## Data & control flow

- Realm/account setup creates `realms`, `accounts`, identities, and `grants`; each `sources` row binds one Realm to an Adapter version, optional Grant, config, and routing override.
- Ingestion materializes `resources`; `chunks`, `fieldIndex`, `artifacts`, `relations`, and `relationResolutions` attach searchable or derived data to those Resources.
- Sync creates `syncRuns`, owns the singleton/global entries in `syncLocks`, records `syncRunCheckpoints`, and advances per-Source `sourceSyncState` cursors/status.
- Deletes propagate along declared foreign keys; table indexes support source/realm/profile/time lookup, typed field filters, relation resolution, and artifact hash lookup.

## Integration points

- Depends on `drizzle-orm` and `drizzle-orm/sqlite-core`; cross-file references link `accounts.ts`, `realms.ts`, `sources.ts`, `resources.ts`, and `sync_runs.ts` into the graph.
- The capability `index.ts` is the direct target of the `@ctxindex/core/schema` package subpath.
- Runtime SQL in `packages/core/src/resource/resource-store.ts`, `relation/relation-store.ts`, `source/service.ts`, `search/local-search.ts`, and `sync/sync-coordinator.ts` operates on these table shapes; `packages/core/src/storage/` owns database creation and migrations.
