# Final drift sweep and incremental cartography

Date: 2026-07-16

## Ground truth

The sweep established live behavior from package manifests/exports, Adapter and SDK entrypoints, canonical migration plus Drizzle schema, CLI command/handler trees, architecture verifiers, and focused public-surface tests before treating prose as evidence.

Current ownership is:

```text
extension-sdk -> public authoring contracts/factories
profiles      -> provider-neutral semantics
core          -> generic orchestration and storage
adapters      -> provider/filesystem I/O in owned modules
apps/cli      -> thin command application adapter
```

Core storage contains only generic tables. Source removal follows declared foreign-key cascades. Package subpaths target capability indexes directly. Workspace manifests and dependency direction are derived and checked from source imports.

## Mechanical sweep

Recent removed/moved identifiers were checked across current-facing docs, active OpenSpec artifacts, codemaps, and production structural comments. Archived prototype/reference/release material, generated history, proposal Context, local comments, and test fixtures were excluded according to the drift-sweep false-positive rules.

The foreground sweep corrected five stale codemap integration references that still named deleted core root shims:

- `packages/core/src/config/codemap.md`
- `packages/core/src/paths/codemap.md`
- `packages/core/src/registry/codemap.md`
- `packages/core/src/search/codemap.md`
- `packages/core/src/schema/codemap.md`

They now identify the capability `index.ts` as the direct package-subpath target. Root/apps/packages/scripts/migration maps were also refreshed for the frozen build/dependency gate and ambient SQL import type.

## Parallel semantic sweep

Four independent read-only partitions completed:

- current root/design/how-to documentation: no remaining findings;
- active main/change OpenSpec artifacts: no findings (proposal pre-change Context correctly treated as target/history, not runtime prose);
- all 58 tracked codemaps after correction: no findings, every concrete backtick path resolved;
- production module comments/JSDoc: no findings.

The active V1 capability deltas remain synchronized. `scale-registry-interface-discovery` correctly remains an active unsynchronized delta until its own explicit sync/archive workflow; this is not drift.

## Cartography

Incremental cartography reported one added and four modified production/config files across nine affected folders. Affected maps were reviewed/updated and the state was refreshed:

```text
python3 /Users/blaz/.agents/skills/cartography/scripts/cartographer.py update --root ./
Updated .slim/cartography.json with 209 files

python3 /Users/blaz/.agents/skills/cartography/scripts/cartographer.py changes --root ./
No changes detected.
```

Result: no current-facing documentation, active-specification, structural-comment, or codemap drift remains.
