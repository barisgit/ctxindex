## Capability Implementation Targets

- `generic-storage` → `openspec/specs/generic-storage/implementation.md`
- `search-routing` → `openspec/specs/search-routing/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

## Module Ownership

`@ctxindex/core` continues to own SQLite setup, Resource persistence, transaction acquisition, and contention normalization. `ResourceStore` is the provider-neutral batch boundary; Source remote-search execution converts Adapter results into `ResourceUpsert` values and delegates the entire origin batch. Adapters remain unaware of SQLite and do not acquire locks. The thin CLI only formats the existing warning/error envelopes and stable exit mapping.

## Interfaces and Data Flow

The canonical generic-storage sidecar adds this batch interface without changing single-Resource callers:

```ts
export class ResourceStore {
  constructor(
    private readonly db: CtxindexDatabase,
    private readonly profiles: ProfileRegistry,
  );
  upsert(input: ResourceUpsert): ResourceUpsertResult;
  upsertMany(
    inputs: readonly ResourceUpsert[],
  ): readonly ResourceUpsertResult[];
  get(
    ref: string,
    options: { readonly includeDeleted?: boolean } = {},
  ): StoredResource | null;
  remove(input: ResourceRemoval): void;
}
```

`upsert()` delegates to the same transactional machinery as a one-element batch. `upsertMany()` validates every Source-scoped Ref before deduplication, collapses duplicate valid Refs to their final input state, acquires one immediate write transaction, resolves Profiles, validates payloads, writes Resource envelopes, and replaces all derived projections before commit. It explicitly rolls back on every thrown error.

Remote-search execution verifies and post-filters provider Resources first. It checks the operation signal, maps the verified Resources to one batch, and calls `upsertMany()`. Unknown-Profile warnings remain Resource-scoped. After either a successful synchronous write wait or a thrown wait, execution yields one event-loop turn before checking cancellation. Only a normalized `storage_busy` failure is converted into one origin warning; all verified provider Resources remain in the returned `SearchRemoteResult`. Other failures cross the boundary unchanged.

One core storage helper recognizes SQLite busy/locked result and extended-result codes. Database open/setup, migrations, and Resource batch acquisition delegate to it. It throws `CtxindexError` with code `storage_busy`, an actionable bounded-contention message, and the SQLite exception as `cause`; raw backend text is never copied to the public message.

## Storage and State

SQLite WAL state and the existing `busy_timeout = 5000` remain authoritative across processes. Database setup applies the timeout before `journal_mode` and other lock-sensitive pragmas. Resource batch state is durable only after explicit commit; rollback covers envelopes, FTS-backed chunks, typed fields, Relations, and duplicate-Ref replacements. No schema, lockfile, daemon, retry counter, or additional persistent state is introduced.

## Security and Compatibility

The change performs no additional provider I/O and does not move data outside the existing local SQLite boundary. Adapter host allowlists, credentials, provider ownership, Ref grammar, and result payloads are unchanged. The new symbolic `storage_busy` code uses the existing exit-50 fallback for terminal errors and requires no compatibility alias or database migration. Cancellation retains code `cancelled` and exit 130.

## Verification

Focused ResourceStore tests exercise validation before last-occurrence Ref deduplication, complete projection commit, rollback on a failing projection, bounded separate-connection exhaustion, normalized cause wrapping, and no raw backend text. Remote-search tests exercise complete results plus a single `storage_busy` warning, cancellation scheduled during failed and successful waits, and non-busy failure propagation. Database and migration tests assert the five-second setup bound and typed exhaustion under real locks.

A compiled CLI e2e test acquires a test-side immediate transaction, launches three separate processes against one shared isolated database, waits for all three to reach a synthetic provider barrier, releases provider results, and requires a compile-time-only trace from every process immediately before its SQLite cache reservation before releasing the storage lock. The trace is absent and unreachable in production builds. The test then asserts successful complete result sets, complete/deduplicated stored projections, and no raw SQLite busy text. Final verification includes affected package tests, compiled-extension coverage, `bun run ci`, strict OpenSpec validation, and change verification.

## Promotion Notes

- Merge the `ResourceStore.upsertMany()` signature, immediate batch transaction flow, SQLite-coordinated writer ownership, and pragma ordering into `openspec/specs/generic-storage/implementation.md`.
- Merge per-origin batch materialization, optional `storage_busy` degradation, cancellation precedence, and the separate-process verification seam into `openspec/specs/search-routing/implementation.md`.
- Merge `storage_busy` normalization, raw SQLite containment, cause retention, and existing exit-50/exit-130 mappings into `openspec/specs/error-taxonomy/implementation.md`.
