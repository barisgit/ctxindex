## 1. Rename the official integration boundary

- [x] 1.1 Add a failing stale-reference/package-graph regression check for the old workspace directory and package coordinate.
- [x] 1.2 Rename `packages/adapters` to `packages/official`, change its package name to `@ctxindex/official`, and update all production imports, manifests, compiled fixtures, verifier configuration, and generated lock metadata without changing exported values or ids.
- [x] 1.3 Run package dependency, architecture, official-package unit/integration, and relocated compiled Extension/daemon verification.

## 2. Synchronize current doctrine and repository maps

- [x] 2.1 Update current documentation, specifications, implementation sidecars, generated references, and codemaps to name `@ctxindex/official` and `packages/official`, preserving historical archive text where intentional.
- [x] 2.2 Refresh cartography state and verify the stale-reference regression check passes across current sources.

## 3. Doctrine and final verification

- [x] 3.1 Promote official-package ownership, stable interface/data-flow, and structural verification doctrine into `openspec/specs/module-architecture/implementation.md`.
- [x] 3.2 Run package build/typecheck/lint, `bun run ci`, integration/e2e gates, and `bunx openspec validate --all --strict`.
- [x] 3.3 Run `openspec-verify-change` for `rename-official-integration-package` and record any remaining integration risks without archiving.
