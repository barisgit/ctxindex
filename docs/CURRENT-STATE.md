# Current State

## V1 context-gateway direction (2026-07-14)

The accepted product model is documented in `CONTEXT.md`, `SPEC.md`, `V1.md`,
`IMPLEMENTATION.md`, and `docs/design/2026-07-13-context-access-layer.md`
(decisions D1–D22). The active OpenSpec change is
`openspec/changes/v1-context-access-layer/`.

The code below those documents is disposable pre-alpha scaffolding, not a
previous product version. No prototype data or CLI compatibility is preserved.
D3 passed with Bun >=1.3.13 and the project is pinned to 1.3.14. Realms are
kept as exact user-defined operating contexts. V1 typed provider Actions are
limited to reversible email Draft create/update.

> Everything below is an archived prototype implementation log. References to
> “v1” in those notes describe an abandoned earlier plan, not current V1 scope.
> Trust current code for prototype behavior and `SPEC.md`/`V1.md` for the target.

## Spec-conformance pass (2026-05-28)

Audited the live code against `SPEC.md` + `V1.md` and closed the confirmed
discrepancies. Fixed and verified (unit + integration + e2e + verifier gates all
green):

- **Chunker**: `chunkText` over-chunked (a 53-char file produced 53 near-duplicate
  chunks); now terminates at end-of-text. `chunker.test.ts` added.
- **Sync exit codes / status** (SPEC §12, V1 §1.6): completed-with-warnings now
  exits `0` (was `20`); unmatched terminal errors map to `50` (was `1`);
  `permission_denied`/`cancelled` set `last_status = failed` (not `disabled`/`idle`);
  the one-line summary prints `errors=N` when non-zero. CLI `mapErrorToExit` never
  returns the non-stable exit code `1`.
- **Transactional apply** (SPEC §8): a sync run's writes commit atomically and the
  cursor advances only on success (rollback on error). `sync_runs` now records
  `cursor_before_json` / `cursor_after_json`.
- **Schema** (SPEC §4, migration `0003`): `external_refs` gained `source_id` +
  `UNIQUE(source_id, kind, value)` with idempotent upsert; `item_chunks` gained
  `UNIQUE(item_id, chunk_index)`; `item_relations` gained `source_id`.
- **local.directory**: built-in ignores now match V1 §1.3.1 exactly; include globs
  use gitignore semantics (not substring); file items get `kind = 'file'`.
- **google.mailbox**: backfill query excludes SPAM/TRASH/CHAT/DRAFT and honors
  `labels_include`/`labels_exclude`; attachment text extraction is gated by a
  text-treatable MIME allowlist.
- **Search** (V1 §1.4): `--provider` is a real provider-module filter
  (adapter-id prefix), distinct from `--adapter`.
- **Network egress** (SPEC §17): single chokepoint `egressFetch` in
  `@ctxindex/core/net`; the CLI loopback delegates OAuth exchange to
  `@ctxindex/core/auth` (SPEC §10d); `network-egress.sh` passes.
- **CLI/UX**: `--log-level` flag wired; `source remove` cascades (no more
  `FOREIGN KEY constraint failed`); `status --source <unknown>` fails fast (exit 2);
  `skills list` no longer lists `README`; `source`/`realm` list JSON is camelCase.
- **local.directory reconciliation**: a completed full scan tombstones file-state
  entries not seen in the walk, while failed scans roll back without tombstoning.

## Search-mode rearchitecture (2026-07-11)

SPEC §10e introduced adapter **search modes**: `indexed` (full local FTS5),
`federated` (provider-side search), `hybrid` (bounded local hot window +
provider search). Implemented and verified (all gates green):

- **Adapter contract**: `searchMode` + optional `search()` on
  `SourceAdapterDefinition`; registry rejects federated/hybrid adapters without
  a search function; `getSearchMode`/`getSearchFn`/`listFederatedAdapters` on
  the registry handle. `local.directory` is `indexed`; `google.mailbox` is
  `hybrid`.
- **Search planner** (`packages/core/src/search/search-service.ts`): local
  FTS5 origin + parallel provider-search fan-out; provider results resolved via
  `external_refs` or materialized as metadata-only items; per-origin ranking
  with round-robin interleave (local first, local wins dedupe); provider
  failures degrade to local results with per-source warnings; `--explain`
  reports `origin: local_fts | provider`; `search --local-only` skips fan-out.
- **google.mailbox hybrid**: backfill bounded by `sync_window_days` (default
  90; `0` disables); expired `historyId` falls back to a bounded window
  re-list (**dissolves former gap M8**); provider `search()` translates
  query/filters to Gmail `q=` syntax with metadata-format hydration.
- **CLI**: `bun upgrade` to 1.3.14 required (1.3.10 ignored
  `pathIgnorePatterns`); `sync`/`auth` command bodies extracted to
  `apps/cli/src/sync/run-sync-command.ts` and
  `apps/cli/src/auth/handle-auth-command.ts` for the thin-lines gate.

Deferred from this pass: hot-window demotion of out-of-window items
(metadata-only downgrade); `item get --hydrate` full-body on-demand fetch.

Remaining spec gaps (deferred, not yet implemented):

- ~~**M8**~~ dissolved by the 2026-07-11 hybrid rework (bounded window re-list).
- **M9** gmail extractable attachments are stored as a chunk on the parent item, not
  as separate items linked via `item_relations`.
- **M2** `item_relations.kind` is not renamed to `relation_type` (cosmetic; source_id
  added).
- **m1** content hashes are stored but not used to skip re-indexing unchanged files.

## f04-core-schema-migrations

The core schema/migration slice is mostly real rather than placeholder: `packages/core/src/schema/` contains the named core tables, `packages/core/src/ids.ts` uses ULIDs, `packages/core/src/storage/db.ts` applies the required SQLite PRAGMAs, and `packages/core/src/storage/migrator.ts` runs core migrations before adapter migrations. The verifier path `bun test packages/core/src/storage/migrator.test.ts` exists and asserts journal tables, PRAGMAs, FTS5 queryability, and the seeded `global` realm. `packages/core/src/cli-init.test.ts` also exists for VAL-INIT-PATHS, but it still needs to be confirmed that it asserts the seeded `global` realm row as requested by the cleanup sweep.

## f05-adapter-registry

The adapter registry is implemented through `packages/core/src/registry/` and `packages/adapters/src/index.ts`, exporting `CTXINDEX_ADAPTER_REGISTRY` with the v1 adapters `local.directory` and `google.mailbox`. The contract verifier `scripts/verify/registry-contract.sh` exists and combines a static grep audit with registry tests, so the main remaining risk is whether the grep audit is strict enough to enforce that all non-test adapter lookups go through the registry handle.

## f06-local-directory-adapter

The local directory adapter has substantive implementation in `packages/adapters/src/local-directory/`: walking, ignore handling, MIME/binary classification, hashing, chunking, and sync operation emission are present, with `packages/adapters/src/local-directory/sync.integration.test.ts` covering an end-to-end fixture tree. The verifier path matches the charter, and the slice appears intended to produce items, chunks, external refs, sync run state, checkpoints, and warning counts for skipped files; it still needs local verification to confirm the exact VAL-LOCAL-DIRECTORY assertions pass after formatting/typecheck changes.

## f07-google-mailbox-adapter

The Gmail adapter remains largely scaffolded: `packages/adapters/src/google-mailbox/index.ts` and migrations exist, but the adapter sync path is not a full Gmail implementation and there is no charter-path integration test at `packages/adapters/src/google-mailbox/sync.integration.test.ts`. The required pieces from the plan are therefore not fully represented yet: allowlisted `safeFetch` calls with Zod schemas, OAuth token handling, backfill and incremental `history.list`, RFC822 parsing, attachment metadata/body extraction, raw-records-off default behavior, and the `resync_required` warning path.

## f08-sync-runner

The sync runner is implemented in `packages/core/src/sync/runner.ts` with global lock acquisition/release, stale-lock cleanup, sync run lifecycle updates, cursor advancement on success, and SPEC-style error mapping helpers in `packages/core/src/sync/exit-codes.ts`. The verifier files for crash locking, reauth flow, and exit codes exist under `packages/core/src/sync/`, but the CLI-level `sync` surface still needs to be checked because the earlier scaffold left several commands as pending placeholders.

## f09-search

The search library is implemented under `packages/core/src/search/` with FTS5 querying, BM25-style ranking, sanitized/relaxed query handling, filters, explain metadata, and the charter verifier `packages/core/src/search/search.integration.test.ts`. The known current failure is a typecheck error in that test around `r.explain?.matchedFrom` being `string | undefined`; the CLI search command wiring also needs audit because the core searcher may exist while the top-level CLI command is still placeholder.

## f10-auth-google-headless

The headless Google auth feature is not fully implemented at the charter path: there is no `apps/cli/src/auth/headless-google.test.ts`, and the command surface under `apps/cli/src/commands/` does not yet include a complete `auth add google --client-id --client-secret --auth-code` implementation. This means BYO token exchange, loopback listener coverage, no-browser/headless behavior, grant persistence, and stdin=`/dev/null` no-prompt assertions remain gaps.

## f11-cli-realm-source-status

Realm, source, status, init, secrets, and skills command files exist in `apps/cli/src/commands/`, and `apps/cli/src/source/realm-cli.test.ts` plus `apps/cli/src/no-prompts.contract.test.ts` exist at the charter verifier paths. The realm/source behavior appears substantially implemented, including defaulting omitted realm to `global` and reporting unknown realms with exit code 2, but the overall no-prompts contract still depends on replacing pending `auth`, `sync`, and `search` placeholders with fail-fast or real command handlers.

## f12-skills

The bundled skills surface is implemented through `apps/cli/src/commands/skills.ts`, `apps/cli/src/skills/loader.ts`, `apps/cli/src/skills/resolve.ts`, the root `skills/` directory, and `apps/cli/src/skills/skills.cli.test.ts`. The main state to verify is whether the CLI entrypoint uses this implementation consistently for `skills list|get|path`, including `--inline` and `--json`, and whether `scripts/verify/cli.sh` sees `skills` in top-level help (the old `bun-link` verifier was removed; v1 invokes the CLI only via `bun cli` / `bun run cli`).

## f13-network-egress-audit

The network egress feature is only partially represented: `scripts/verify/network-egress.sh` exists for a static audit, but the runtime fetch-interceptor integration test described by the plan is not present. The static script must be checked for coverage of every forbidden egress shape (`fetch`, `http.request`, `https.request`, and configurable URL construction) and the runtime test still needs to prove local + mocked Google sync only contacts `oauth2.googleapis.com`, `accounts.google.com`, `gmail.googleapis.com`, and `www.googleapis.com`.
