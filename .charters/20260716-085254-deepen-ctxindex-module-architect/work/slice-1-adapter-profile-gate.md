# Slice 1 — Adapter and Profile ownership

Date: 2026-07-16
OpenSpec: `deepen-module-architecture` tasks 1.1–1.3

## Observable result

- `packages/adapters/src/` production root contains only `builtins.ts` and `index.ts`.
- `google-mailbox/` owns Gmail config, definition, operations, response/message helpers, URL routing, and tests.
- `local-directory/` owns its Adapter definition and integration test.
- `builtins.ts` only composes imported Profiles and Adapter definitions.
- Dead Adapter-local OAuth/retry/schema/egress compatibility code and `CTXINDEX_TEST_FETCH_LOG` are absent.
- The communication-message registry contract and normalized file-path predicate are Profile-owned.
- Five unused Adapter dependencies and the stale Adapter `db:generate` script are removed; frozen install succeeds.

## Verification

- `bun test ./scripts/verify/module-architecture.test.ts` — 2 pass, 0 fail.
- `bun test ./packages/adapters/src` — 108 pass, 0 fail.
- `bun test ./packages/profiles/src` — 20 pass, 0 fail.
- `bun test --path-ignore-patterns '__none__' --pass-with-no-tests ./packages/adapters/src/google-mailbox ./packages/adapters/src/local-directory` — 118 pass, 0 fail.
- `bash scripts/verify/network-egress.sh` — passed, including production local no-egress and Gmail allowlist/rejection e2e.
- `bash scripts/verify/full-test-suite.sh` — 735 pass, 0 fail.
- `bun run typecheck` — passed.
- `bun run lint` — passed after canonical formatting.
- `bun install --frozen-lockfile` — passed, 163 installs / 251 packages, no changes.
- `git diff --check` — passed.
- Incremental cartography — 202 files tracked, no changes detected after update.

Independent review: approved with 0 critical and 0 important findings. It confirmed operation moves were behavior-equivalent, deleted provider code had no live consumers, package subpath seams remained intact, path validation was equivalent, and architecture/full-suite discovery follows the relocated tree. The intentionally removed `communicationMessageExtension` symbol had no production consumer; the change contract explicitly permits unreachable symbols in private workspace packages to be removed.
