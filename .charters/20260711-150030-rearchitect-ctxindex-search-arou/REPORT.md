# Charter Report

## Objective

Rearchitect ctxindex search around capability-based adapters: indexed (full local FTS5), federated (provider-side search), and hybrid (bounded local hot set + federated long tail). Amend SPEC/V1 doctrine, extend the adapter contract with a declared mode and optional search capability, turn core search into a planner that merges local FTS5 and federated results, and rework google.mailbox to hybrid mode (bounded metadata window sync, live Gmail search, on-demand hydration), dissolving the M8 bounded re-list gap. local.directory stays indexed and unchanged. All existing gates (typecheck, lint, unit, integration, e2e, verifiers incl. network-egress) stay green.

## Criteria

### C1. Doctrine defines search modes normatively

Evidence: SPEC.md §10e added (modes, capability requirements, planner rules, offline behavior); V1.md §1.3.2 rewritten to bounded-window sync + provider search + hydration, §1.4 planner + --local-only, milestone 3 updated; IMPLEMENTATION.md §3d types (AdapterSearchMode/Context/Query/Result/Function, registry methods) + §10.1 planner algorithm.

### C2. Adapter contract exposes mode and search capability

Evidence: packages/core/src/registry/{types,handle,registry-core,errors}.ts extended; createSourceAdapter/registerAdapter reject federated/hybrid without search (registry_search_capability_missing); adapters declare modes; registry-core.test.ts 8 pass incl. new mode/capability tests.

### C3. Core search planner merges local and federated results

Evidence: search-service.ts planner (federatedSources, resolveProviderItem materialization via external_refs, interleave with local-wins dedupe, per-source warning degradation); origin on SearchResult/ExplainInfo; CLI --local-only + warnings on stderr; search-service.test.ts 5 planner tests pass (merge, repeat-dedupe, degradation, localOnly, explain).

### C4. google.mailbox runs in hybrid mode

Evidence: DEFAULT_SYNC_WINDOW_DAYS=90, sync_window_days config (0 disables); backfill q gains after:<epoch>; historyId-404 path performs bounded window re-list; search() translates text/since/until + default exclusions to Gmail q=, metadata-format hydration; sync.integration.test.ts 7 pass (window bound, window-off, provider search, bounded re-list) with gmail.googleapis.com-only host assertion. Hydration note: full-body on-demand fetch deferred to item-get surface; search returns provider snippets.

### C5. All repository gates green

Evidence: typecheck 0; lint 0 (207 files); bun test 170 pass/0 fail; test:e2e 100 pass/0 fail; test:integration 38 pass/0 fail; ci.sh all gates PASS (incl. architecture-lint, cli-thin-lines after sync/auth command extraction); cli.sh 0; network-egress.sh 0; no-prompts-static 0; env-loader 0. Note: required bun upgrade 1.3.10->1.3.14 (pathIgnorePatterns honored); pre-existing failures fixed: table-wrap assertion in source e2e, grants.ts noqa for display-only scope prefix.

## Summary

Completed the capability-based search rearchitecture end to end. Adapters now declare a search mode (indexed | federated | hybrid); the core search service is a planner that merges local FTS5 results with provider-side search results (per-origin ranking, round-robin interleave, graceful degradation, origin-aware explain, --local-only escape hatch). google.mailbox moved to hybrid mode: local sync is bounded to a configurable 90-day hot window instead of full-mailbox replication, expired history cursors trigger a bounded window re-list (dissolving the former M8 gap), and out-of-window mail is reachable via live Gmail q= provider search. local.directory is unchanged apart from declaring indexed mode. All repository gates are green.

Follow-ups (documented in docs/CURRENT-STATE.md):
- Hot-window demotion: purge body chunks for items that age out of the window (metadata-only downgrade) so existing large databases shrink.
- `item get --hydrate`: on-demand full-body fetch surface for provider-origin items.
- bun 1.3.14+ is required (1.3.10 silently ignored bunfig test.pathIgnorePatterns).
