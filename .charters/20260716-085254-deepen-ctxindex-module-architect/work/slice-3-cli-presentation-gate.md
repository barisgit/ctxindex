# Slice 3 — thin CLI and presentation gate

Date: 2026-07-16

## Result

Passed. Registry projection/schema/text/Markdown concerns now have explicit private owners behind the unchanged formatter Interface. Action and Artifact Citty files are thin declaration adapters over owned workflow and presentation Modules. The established 80-nonblank/non-import command gate now discovers every production command automatically rather than receiving a filename allowlist.

## Architecture evidence

- `format/registry.ts` is an eight-line declaration-free facade over projection, shared JSON-Schema interpretation, text, and Markdown Modules; Extension listing has its own formatter.
- Action and Artifact parsers, workflows, formatters, and focused tests live with their owners; command declarations contain only Citty metadata and handler wiring.
- `parseFlags` gained an opt-in strict mode for the closed Action grammar. Differential review confirmed exact old/new Action behavior. Non-strict parsing remains byte-for-byte equivalent, including negative numeric and degenerate `--=` cases; focused tests lock both.
- `CliDeps` no longer exposes the unused duplicate `store` alias; `secretsStore` remains the sole store field.
- `cli-thin-lines.ts` discovers all non-test `apps/cli/src/commands/*.ts`, sorts them deterministically, retains optional explicit paths, and enforces the existing 80-line nonblank/non-import budget. CI and `just cli-thin-lines` have no hardcoded command list. Discovery and one-line-over-budget tests fail on regressions.
- Incremental cartography documents the new ownership and verification seam.

## Verification

Passed on the final snapshot:

```text
bun test ./scripts/verify/module-architecture.test.ts ./scripts/verify/architecture-lint.test.ts ./scripts/verify/cli-thin-lines.test.ts
bun run scripts/verify/architecture-lint.ts
bun run scripts/verify/cli-thin-lines.ts
bun test ./apps/cli/src/action ./apps/cli/src/artifact ./apps/cli/src/args/flags.test.ts ./apps/cli/src/args/action.test.ts ./apps/cli/src/args/artifact.test.ts ./apps/cli/src/args/search.test.ts ./apps/cli/src/commands/registry-interface.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/registry-interface.e2e.test.ts ./apps/cli/src/e2e/source.e2e.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/gmail-draft-action.e2e.test.ts
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/v1-workflow.e2e.test.ts
bun test
bun run typecheck
bun run lint
bun run ci
openspec validate deepen-module-architecture --strict
git diff --check
bash -n scripts/verify/ci.sh
just --dry-run cli-thin-lines
```

The first targeted attempt ran the Draft and V1 workflow e2es concurrently; the V1 workflow exceeded its existing 5-second per-test default under compilation contention. It passed alone in 4.2 seconds, passed again in the sequential final gate, and passed inside final CI. No timeout or production change was required.

## Independent review

- Review `73076cff-99e3-4503-9ad4-c4cb6e4e4a48`: approved with 0 critical/important. It identified one degenerate non-strict `--=` key difference; that was corrected and locked by a focused test.
- Final-snapshot review `4c28582d-48d6-4b35-9a70-b456ff5466a5`: approved with no factual issues, 0 critical/important. It independently differential-checked strict Action and non-strict shared flag behavior, confirmed exact moved formatter/handler semantics, automatic command discovery, CI/just wiring, dependency-field removal, and focused gates.

No live provider traffic was run.
