## 1. Core: enumeration and pagination

- [x] 1.1 Extend `LocalSearchQuery`/`LocalSearchExecutor` (packages/core/src/search): optional query text triggers enumeration ordered by `occurred_at` DESC NULLs last, tiebreak `ref` ASC; add `offset` support and window slicing for both enumeration and rank-ordered queryful search
- [x] 1.2 Extend `SearchPlanner` (planner.ts): make `text` optional; filter-only input requires at least one filter and forces local-only legs (no `search-remote` calls); reject `remote` without text and `offset` on non-local execution; compute and return `pagination { offset, limit, hasMore }` for local executions via limit+1 probing
- [x] 1.3 Slice gate: focused unit tests in `local-search.test.ts` and `planner.test.ts` pass — enumeration ordering incl. NULL timestamps and ref tiebreak, offset windows with no overlap/gap, `hasMore` boundaries, filter-only never invokes remote, validation errors for bare/remote/offset misuse

## 2. CLI surface

- [x] 2.1 Update `apps/cli/src/args/search.ts`: query positional optional when ≥1 filter present; actionable errors for bare `search`, `--remote` without query, and invalid `--offset`; parse `--offset` (integer ≥ 0); enforce offset-requires-local rule; update `searchUsage` and citty arg descriptions in `commands/search.ts`
- [x] 2.2 Slice gate: `apps/cli/src/args/search.test.ts` and `commands/search.test.ts` cover the new parse branches and exit-2 messages; `bun cli search` filter-only and paginated invocations produce deterministic `--json` output against a seeded local DB

## 3. Skills surface

- [x] 3.1 Update `skills/getting-started.md` and `skills/reference/cli-overview.md`: document filter-only enumeration (query optional with filters, newest-first ordering, local-only with remote deferral) and the pagination idiom (`--limit`/`--offset`, advance offset by limit while `pagination.hasMore` is true)
- [x] 3.2 Slice gate: skills content checks pass (`bun cli skills` surfaces updated docs; any skills/docs drift checks in the project gate stay green)

## 4. Final verification

- [x] 4.1 Run the full project gate: `bun run ci` (all gates pass except 11 pre-existing OAuth loopback-timeout e2e failures also present on the untouched base commit and main checkout; all search suites green)
- [ ] 4.2 Run `openspec-verify-change` against `browse-and-paginate-search` and fix findings
