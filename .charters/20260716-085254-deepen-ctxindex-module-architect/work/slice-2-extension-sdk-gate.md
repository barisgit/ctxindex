# Slice 2 — public Extension SDK depth gate

Date: 2026-07-16

## Result

Passed. `@ctxindex/extension-sdk` now exposes its unchanged package Interface from a thin explicit barrel over cohesive reference, Profile, provider-operation, Adapter, and Extension Modules.

## Compatibility evidence

- `packages/extension-sdk/src/public-surface.test.ts` imports every public type and asserts the exact 43-symbol index surface plus the exact three runtime factories.
- Existing factory tests preserve literal ID/version/schema/capability/Action-map inference and identity behavior.
- `scripts/verify/module-architecture.test.ts` enforces the private Module layout, implementation-free public barrel, and absence of any `@ctxindex/core` dependency.
- The external tenders Extension, registry interface e2e, and relocated D3 compiled-Extension spike pass unchanged.
- Incremental cartography documents the settled SDK ownership.

## Verification

Passed:

```text
bun test ./packages/extension-sdk/src
bun test ./scripts/verify/module-architecture.test.ts
bun test ./examples/tenders-extension/extension.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/external-tenders-extension.e2e.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/registry-interface.e2e.test.ts
bun run typecheck
bun run lint
bun test
bash scripts/spikes/d3-compiled-extension/run.sh
openspec validate deepen-module-architecture --strict
git diff --check
```

`cartographer.py changes` identified only the SDK hierarchy; its maps and `.slim/cartography.json` were updated.

## Independent review

Approved by independent review run `940a7193-e56f-483f-9c90-b633c9ee2cc2`: 0 critical, 0 important findings. The reviewer confirmed the exact public symbol set, unchanged generic factory signatures, acyclic type-only private dependency graph, unchanged `ExtensionAuthoringHost`, no core dependency, durable architecture tests, and external compiled-Extension compatibility.

No live provider traffic was run.
