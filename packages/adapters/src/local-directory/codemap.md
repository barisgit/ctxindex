# packages/adapters/src/local-directory/

## Responsibility

Implements the `local.directory` indexed adapter: validates source configuration, deterministically discovers safe in-root text files, converts them to `file@1` resources, and maintains an incremental manifest cursor.

## Design/patterns

- `config.ts` defines the strict `localDirectorySourceConfigSchema` and `DEFAULT_SIZE_CAP_BYTES`; `definition.ts` owns `localDirectoryAdapterDefinition`, directly binds `fileProfile`, and deliberately declares no Provider because filesystem access needs no Grant.
- `walker.ts` is a deterministic, non-following filesystem walker. `walkDirectory()` composes built-in ignores, root `.gitignore`, configured excludes, and `.ctxindexignore`, applies optional includes, rejects symlinks/path escapes, and records uncertain prefixes instead of treating inaccessible paths as deleted.
- `reader.ts` uses a snapshot/check pattern: `readLocalFile()` opens with `O_NOFOLLOW`, compares pre/post metadata, enforces the size cap, rejects binary or invalid UTF-8 content, and computes a SHA-256 content hash.
- `ref.ts` reuses the file Profile's normalized relative-path predicate, preserves its thrown Error interface, and creates canonical `ctx://<SOURCE>/file/<encoded-path>` references. `order.ts` supplies code-point ordering for reproducible traversal, emissions, and cursors.
- `sync.ts` acts as the orchestration pipeline and incremental-diff strategy around a strict, sorted version-1 manifest cursor.

## Data & control flow

1. `localDirectorySync(context)` parses `context.source.config` and validates `context.cursor`; an invalid non-null cursor becomes an `invalid_cursor` warning and suppresses removals for that run.
2. `walkDirectory()` canonicalizes the root, traverses entries in code-point order, and returns `WalkerEntry` values, warnings, and uncertain path prefixes.
3. Each entry passes to `readLocalFile()`; successful reads produce manifest records and, when new/changed or in `resync` mode, complete `file@1` `SyncedResource` payloads. Read/stat failures extend uncertainty so prior records are retained.
4. `localDirectorySync()` emits sorted warnings, then `upsertResource` emissions, safe `removeResource` emissions for disappeared paths, and finally a sorted version-1 `checkpoint`. Every stage observes `context.signal` cancellation.

## Integration points

- `definition.ts` registers `localDirectorySourceConfigSchema` and `localDirectorySync` as the `local.directory` adapter (`routing: 'indexed'`, capability `sync`, profile `file@1`); builtins imports the definition and the package index re-exports it with the config schema.
- `sync.ts` integrates with `@ctxindex/extension-sdk` through `SyncContext`, `SyncEmission`, `SyncedResource`, and `context.emit()`.
- `reader.ts` depends on `file-type` for binary media detection; `walker.ts` depends on `ignore` for gitignore-style matching and Node filesystem/path APIs for containment checks.
