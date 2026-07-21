## 1. Core aggregation and persistence

- [x] 1.1 Add failing coordinator tests for warning-only aggregation, last structured warning retention, warnings preserved before terminal failure, and one error per terminal failure.
- [x] 1.2 Add failing fresh-schema and Source-status persistence tests for bounded warning columns and severity-separated current/run state.
- [x] 1.3 Implement coordinator, schema, canonical initialization, and Source projections for separate warning and error accounting.
- [x] 1.4 Slice gate: run focused core sync, schema/migrator, and Source service tests plus core typecheck.

## 2. CLI and agent-facing projections

- [x] 2.1 Add failing sync command/formatter tests for warning-only JSON/text success and mixed warning/error output.
- [x] 2.2 Add failing status and Source inventory JSON/text tests for `warningsCount` and `lastWarning` alongside error diagnostics.
- [x] 2.3 Implement the thin CLI projections and update agent-facing status documentation where the field contract is described.
- [x] 2.4 Slice gate: run focused CLI sync, status, Source, and synthetic e2e tests plus CLI architecture/type gates.

## 3. Doctrine and final verification

- [x] 3.1 Promote applicable doctrine into the canonical sync-operations, error-taxonomy, generic-storage, and cli-surface implementation sidecars.
- [x] 3.2 Run `bun run ci`, `bunx openspec validate --all --strict`, `openspec-verify-change`, and `git diff --check`; resolve every critical or warning finding before completion.
