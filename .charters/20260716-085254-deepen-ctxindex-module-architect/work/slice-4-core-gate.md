# Slice 4 — core prototype and locality gate

Date: 2026-07-16

## Result

Passed. Core now relies only on its generic declared storage graph, exposes logger infrastructure through a deep Interface, and routes package subpaths directly to canonical capability indexes without redundant root shims.

## Architecture evidence

- `SourceService.removeSource()` performs one Source deletion. Canonical `ON DELETE CASCADE` edges remove its Resources, field index, chunks, Relations/resolutions, Artifacts, source sync state, sync runs/checkpoints/locks, and FTS index rows while preserving an unrelated Source and Realm.
- `sync_runs.source_id` now declares the required cascade in both `migrations/0000_init.sql` and `schema/sync_runs.ts`; a focused migration/Drizzle contract prevents drift.
- The unused permissive prototype `sync/operations.ts` union and dynamic `sqlite_master`/`foreign_key_list` Adapter-table sweep are deleted. The strict SDK `SyncEmission` path remains the only sync contract.
- `logger/index.ts` retains the public logger Interface and orchestration while `redaction.ts` owns recursive field/canary sanitization and `rotation.ts` owns sync output, pino-roll options, compression scheduling, and file operations. The moved implementation preserves the 25/100/250 ms schedule, test unref behavior, TTY stream, roll settings, and redaction paths.
- `secrets/index.ts` owns the previous full Secrets subpath surface. Config/logger/paths/registry/schema/search/secrets/storage/sync package subpaths target capability indexes directly; nine pure/empty root shims are gone.
- The repository-owned agent-howto contract test moved from the core package to `scripts/verify/` with only its repository-root depth adjusted.
- Incremental cartography documents the settled core ownership.

## Verification

Passed on the reviewed snapshot:

```text
bun test ./scripts/verify/module-architecture.test.ts ./scripts/verify/agent-howtos.test.ts
bun test ./packages/core/src/source/source-service.test.ts ./packages/core/src/source/sync-source.test.ts ./packages/core/src/sync
bun test --path-ignore-patterns '__none__' ./packages/core/src/logger/redaction.integration.test.ts
bun test ./packages/core/src/secrets
bun run scripts/verify/exports-map.ts
bun test ./packages/core/src/storage/migrator.test.ts
bun test
bun run typecheck
bun run lint
bun run ci
openspec validate deepen-module-architecture --strict
git diff --check
```

## Independent review

Review `99bbdaed-46ce-4e04-9936-32c0707cc419` approved tasks 4.1–4.4 with no factual issues, 0 critical and 0 important findings. It independently checked every Source-owned cascade and foreign-key pragma, prototype removal, exact logger timing/options/redaction/public factories, Secrets export equivalence, subpath targets, safe shim deletion, test relocation, and architecture-test durability.

No live provider traffic was run.
