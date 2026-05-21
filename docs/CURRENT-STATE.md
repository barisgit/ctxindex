# Current State

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

The bundled skills surface is implemented through `apps/cli/src/commands/skills.ts`, `apps/cli/src/skills/loader.ts`, `apps/cli/src/skills/resolve.ts`, the root `skills/` directory, and `apps/cli/src/skills/skills.cli.test.ts`. The main state to verify is whether the CLI entrypoint uses this implementation consistently for `skills list|get|path`, including `--inline` and `--json`, and whether `scripts/verify/bun-link.sh` sees `skills` in top-level help.

## f13-network-egress-audit

The network egress feature is only partially represented: `scripts/verify/network-egress.sh` exists for a static audit, but the runtime fetch-interceptor integration test described by the plan is not present. The static script must be checked for coverage of every forbidden egress shape (`fetch`, `http.request`, `https.request`, and configurable URL construction) and the runtime test still needs to prove local + mocked Google sync only contacts `oauth2.googleapis.com`, `accounts.google.com`, `gmail.googleapis.com`, and `www.googleapis.com`.
