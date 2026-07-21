## Context

Core currently folds non-fatal warning emissions into `errors_count` and a text `error_summary`. The same conflation propagates through `SyncRunResult`, current Source sync state, `status`, and Source inventory. This obscures whether a run failed and makes warning-only completion look unhealthy. The repository is pre-alpha, so the canonical fresh schema may be updated directly without compatibility migrations or aliases.

## Goals / Non-Goals

**Goals:**

- Keep warning and error severity distinct throughout aggregation, persistence, and presentation.
- Retain the last warning as a structured diagnostic, bounding persisted fields while keeping the original runtime diagnostic, and keep total counts bounded.
- Preserve warning evidence when a later terminal failure occurs.
- Keep stable terminal status and exit mappings unchanged.

**Non-Goals:**

- Persisting an unbounded diagnostic history.
- Changing Adapter warning shapes, provider behavior, or retry policy.
- Adding compatibility aliases or migrations for pre-release databases.

## Decisions

1. Store `warnings_count` and `last_warning_json` alongside existing error bookkeeping on both Sync Runs and current Source sync state. A structured JSON value retains bounded prefixes of `code`, `message`, and optional `ref`; counts plus one last bounded value limit storage while runtime results keep the original diagnostic.
2. Treat warning emissions as warning diagnostics only. A thrown terminal sync failure contributes exactly one error and does not erase prior warning aggregation.
3. Project the structured warning through core and CLI as `lastWarning`, with `warningsCount` adjacent to existing `errorsCount`/`lastError`. This keeps machine output explicit and readable output compact.
4. Update the canonical initial schema directly. The project has no released compatibility obligation, and adding speculative migration paths would contradict current storage doctrine.

## Risks / Trade-offs

- [Malformed persisted warning JSON could break status reads] → Parse through a bounded defensive helper and treat invalid or absent values as no structured warning.
- [Duplicating current/run diagnostic columns can drift] → Update both records in the same coordinator terminal paths and cover completed and failed runs with persistence tests.
- [Text output may become noisy] → Show only counts and the last warning where diagnostics are already displayed.

## Migration Plan

Update the canonical `0000_init.sql` and Drizzle schema definitions. Existing pre-alpha local databases are not migrated; isolated test state and new initialization receive the corrected schema.

## Open Questions

None.
