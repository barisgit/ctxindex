## 1. Shared format contract

- [x] 1.1 Add failing pure tests for explicit/default format resolution, TSV escaping, terminal-width layout switching, and complete non-truncated values.
- [x] 1.2 Implement the shared structured-output arguments, resolver, escaped TSV serializer, and `cli-table3` pretty renderer.
- [x] 1.3 Run the shared formatter and command-model focused tests before migrating commands.

## 2. Resource discovery and retrieval

- [x] 2.1 Add failing Search/Get tests for complete long Refs, complete Resource envelopes and payloads, compact canonical JSON, and mode-specific warning streams.
- [x] 2.2 Migrate `search` and `get` to pretty/text/json while preserving Search `--refs`, daemon/direct parity, and complete result envelopes.
- [x] 2.3 Add a failing planner test for false multi-Source continuation guidance, implement Source-specific rerun guidance, and preserve exact-Source continuation behavior.
- [x] 2.4 Run focused Search/Get formatter, argument, planner, command, and compiled workflow tests.

## 3. Structured inventories

- [x] 3.1 Add failing safe-projection and layout tests for status, Source, Realm, Account, OAuth App, and Extension inventories across pretty/text/json.
- [x] 3.2 Migrate status and inventory command definitions, inputs, handlers, and formatters to the shared output contract without changing terse mutation receipts.
- [x] 3.3 Run focused inventory formatter, handler, help, and initialization-guard tests.

## 4. Documentation and maps

- [x] 4.1 Update CLI help/reference and user/agent documentation for the shared defaults, text grammar, explicit JSON format, complete get output, and export/describe exceptions.
- [x] 4.2 Document sync as a temporary exception and record the required pretty/text/json mapping follow-up without editing sync command files.
- [x] 4.3 Refresh affected CLI, format, Search, argument, command, and workflow codemaps and run their focused documentation tests.

## 5. Doctrine and final verification

- [x] 5.1 Promote applicable doctrine into canonical CLI-surface and search-routing implementation sidecars.
- [x] 5.2 Run CLI lint/typecheck/tests, CLI architecture gates, and the strongest affected end-to-end workflows.
- [x] 5.3 Run `bun run ci`, `bunx openspec validate --all --strict`, and the OpenSpec change verification workflow.
- [x] 5.4 Obtain independent review when a reviewer slot is available; otherwise complete a local launch-critical review, then commit without pushing, merging, archiving, live auth, or user-state access.

## 6. Independent-review hardening

- [x] 6.1 Add failing tests and migrate primary `thread` and `artifact list` reads to the shared formats; narrow documentation and daemon lifecycle claims to the exact migrated set.
- [x] 6.2 Add a failing zero-effects test and reject `search --refs` with explicit pretty/JSON selectors while retaining omitted/default text projection.
- [x] 6.3 Add failing display-width tests and constrain vertical cards to the available terminal width with lossless wrapping.
- [x] 6.4 Add failing TSV round-trip tests, define unambiguous null encoding, and remove Search sentinel coercions.
- [x] 6.5 Run focused tests, CLI typecheck/lint, strict OpenSpec validation, obtain re-review when available, and commit without full CI, push, merge, archive, or user-state access.

## 7. Pre-release flag simplification

- [x] 7.1 Remove public `--json`, expose JSON only through `--format json`/`-f json`, and migrate sync, daemon lifecycle, docs, skills, secrets, Actions, Artifacts, and Extension lifecycle commands.
- [x] 7.2 Add conservative `-s`, `-r`, `-l`, and file-output `-o` aliases through authoritative Citty definitions and verify their generated help/reference projection.
- [x] 7.3 Update all current-facing docs, examples, skills, canonical specs, and tests; prove removed `--json` fails before effects.
- [x] 7.4 Run focused CLI tests, regenerate the CLI reference, run full CI and strict OpenSpec validation, then commit locally without pushing.
