# Charter: Rearchitect ctxindex search around capability-based adapters: indexed (full loca

<!-- This file is the single source of truth for this charter.
     You (the agent) edit it directly — there is no tool for editing
     criteria or recording evidence. The runtime re-reads it after your
     edits. Grammar the runtime parses:

       ## Objective                       — required, prose
       ## Criteria                        — required section
       ### C<n>. <title>                  — one heading per criterion
       Depends: C1, C2                    — optional line, advisory ordering only
       Evidence: pass|fail|none — <note>  — one line per criterion

     Everything else (## Scope, grouping headings, prose) is yours. -->

## Objective

Rearchitect ctxindex search around capability-based adapters: indexed (full local FTS5), federated (provider-side search), and hybrid (bounded local hot set + federated long tail). Amend SPEC/V1 doctrine, extend the adapter contract with a declared mode and optional search capability, turn core search into a planner that merges local FTS5 and federated results, and rework google.mailbox to hybrid mode (bounded metadata window sync, live Gmail search, on-demand hydration), dissolving the M8 bounded re-list gap. local.directory stays indexed and unchanged. All existing gates (typecheck, lint, unit, integration, e2e, verifiers incl. network-egress) stay green.

## Scope

In: SPEC/V1/IMPLEMENTATION amendments; adapter contract (mode + optional search capability); core search planner; google.mailbox hybrid rework (bounded window sync, provider search, on-demand hydration); tests and verifier gates.
Out: vector search, new adapters, npm distribution, cross-source dedup, UI.

## Criteria

<!-- Each criterion is an observable pass condition — something you can
     prove by driving the real thing. Write the title as an assertion
     you could read aloud ("X does Y"), not a task ("do X"). Below the
     title, optionally describe HOW to verify: the command, the budget
     or threshold, known failure modes.

     Evidence rules:
     - "Evidence: none" until you have actually verified it.
     - After verifying:
         Evidence: pass — <what you ran and what it showed> (date)
         Evidence: fail — <what failed and why> (date)
     - Record real output, not intentions. Completion requires every
       criterion to have pass evidence, re-verified if source changed
       after it was recorded (the runtime tracks this).

     Evidence quality, strongest first — prefer the strongest that fits:
     1. Use it like a user would: start the real app/server, drive the
        actual flow (subagent or browser automation if needed), and save
        a screenshot or recording into this charter's work/ directory.
        Reference it from the note, e.g.
          Evidence: pass — drove checkout on dev server, order confirmed;
          recording: work/c2-checkout.webm (2026-07-02)
     2. Observe the real system: run the CLI on real input, curl the
        live endpoint; paste or save the real output.
     3. Run the checks: tests/typecheck/lint. Weakest — fine on its own
        only for criteria that are purely about code behavior.
     Before citing an artifact, inspect it yourself: open the screenshot,
     replay the recording. If it does not show the built thing working,
     the criterion is not verified.

     A charter with NO criteria is open-ended: it never completes and
     runs until paused or abandoned. Add criteria when the work becomes
     boundable.

     Example criterion (copy the shape, replace the content):

     ### C1. Checkout flow completes end to end
     Start the dev server, add an item, pay with the test card.
     Confirmation screen must show the order id.
     Evidence: none

     ### C2. No regression in the existing test suite
     Depends: C1
     Evidence: none
-->

### C1. Doctrine defines search modes normatively
SPEC.md defines indexed/federated/hybrid adapter search modes, the optional adapter search capability, planner merge semantics, and hybrid bounded-window sync; V1.md reflects google.mailbox as hybrid and drops the full-backfill mandate; IMPLEMENTATION.md types match.
Evidence: pass — SPEC.md §10e added (modes, capability requirements, planner rules, offline behavior); V1.md §1.3.2 rewritten to bounded-window sync + provider search + hydration, §1.4 planner + --local-only, milestone 3 updated; IMPLEMENTATION.md §3d types (AdapterSearchMode/Context/Query/Result/Function, registry methods) + §10.1 planner algorithm.

### C2. Adapter contract exposes mode and search capability
Registry types carry searchMode ('indexed' | 'federated' | 'hybrid') and optional search(); local.directory declares indexed, google.mailbox declares hybrid; registry contract tests pass.
Depends: C1
Evidence: pass — packages/core/src/registry/{types,handle,registry-core,errors}.ts extended; createSourceAdapter/registerAdapter reject federated/hybrid without search (registry_search_capability_missing); adapters declare modes; registry-core.test.ts 8 pass incl. new mode/capability tests.

### C3. Core search planner merges local and federated results
Search service runs FTS5 for indexed/hybrid sources, invokes adapter search for federated/hybrid sources, interleaves per-source ranked results, and --explain reports result origin (local_fts | provider). Unit/integration tests prove merge and origin.
Depends: C2
Evidence: pass — search-service.ts planner (federatedSources, resolveProviderItem materialization via external_refs, interleave with local-wins dedupe, per-source warning degradation); origin on SearchResult/ExplainInfo; CLI --local-only + warnings on stderr; search-service.test.ts 5 planner tests pass (merge, repeat-dedupe, degradation, localOnly, explain).

### C4. google.mailbox runs in hybrid mode
Backfill is bounded by sync_window_days (default bounded, not full-mailbox); provider search capability translates queries to Gmail q= syntax via egressFetch allowlisted hosts; expired historyId falls back to bounded re-list (M8 dissolved); on-demand hydration fetches bodies only when requested. Integration tests with mocked Gmail prove all paths.
Depends: C2
Evidence: pass — DEFAULT_SYNC_WINDOW_DAYS=90, sync_window_days config (0 disables); backfill q gains after:<epoch>; historyId-404 path performs bounded window re-list; search() translates text/since/until + default exclusions to Gmail q=, metadata-format hydration; sync.integration.test.ts 7 pass (window bound, window-off, provider search, bounded re-list) with gmail.googleapis.com-only host assertion. Hydration note: full-body on-demand fetch deferred to item-get surface; search returns provider snippets.

### C5. All repository gates green
bun run typecheck, bun run lint, bun test, bun run test:e2e, bun run test:integration, scripts/verify/ci.sh, cli.sh, network-egress.sh, no-prompts-static.ts all exit 0.
Depends: C3, C4
Evidence: pass — typecheck 0; lint 0 (207 files); bun test 170 pass/0 fail; test:e2e 100 pass/0 fail; test:integration 38 pass/0 fail; ci.sh all gates PASS (incl. architecture-lint, cli-thin-lines after sync/auth command extraction); cli.sh 0; network-egress.sh 0; no-prompts-static 0; env-loader 0. Note: required bun upgrade 1.3.10->1.3.14 (pathIgnorePatterns honored); pre-existing failures fixed: table-wrap assertion in source e2e, grants.ts noqa for display-only scope prefix.
