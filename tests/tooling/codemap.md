# tests/tooling/

## Responsibility

Owns repository-level contract tests for developer commands, Turbo lanes, release automation, executable scripts, and cross-package architecture. Product packages do not own these CI and repository-shape assertions.

## Design

- `test-lanes.test.ts` locks package-owned test lanes, the root Turbo graph, focused verifier cache inputs, and the single root `package.json` command surface.
- `verify/` tests static policy implementations and repository-wide architectural/documentation contracts.
- `release/` tests CLI and Extension SDK package construction, exact-artifact smoke behavior, release gating, and workflow policy.
- `with-timeout.test.ts` and `worktree-new.test.ts` exercise the two reusable executable helpers in `scripts/`.

## Flow and integration

Root `//#test:tooling` runs unit contracts with a lane-specific file-backed Keychain mock. Root `//#test:integration:tooling` names the four repository-owned integration tests explicitly. Tests import implementations from `scripts/` and inspect root manifests, workflows, package sources, and documentation without placing repository policy under a product package's `src/` tree.
