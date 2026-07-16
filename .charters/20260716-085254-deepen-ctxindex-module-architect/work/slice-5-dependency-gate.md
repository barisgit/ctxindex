# Slice 5 — dependency and documentation health gate

Date: 2026-07-16

## Result

Passed. Workspace dependency direction and direct runtime manifests are now executable repository contracts rather than review conventions.

## Architecture evidence

- `scripts/verify/package-dependencies.ts` reads the root workspace declaration, recursively discovers production and colocated test source files without a source-file allowlist, and uses the TypeScript AST for static imports/re-exports, import-equals, import types, literal dynamic imports, and `require`.
- Bare package normalization handles scoped subpaths while ignoring relative/absolute/internal imports and Node/Bun built-ins. Strings, templates, comments, and non-literal imports do not create false dependencies.
- Verification rejects undeclared imports, unused direct runtime dependencies, forbidden workspace edges in either imports or manifests, and non-Zod external dependencies in the SDK/Profile foundation. CLI applications may depend on public package workspaces but not sibling applications. All output uses deterministic code-unit ordering.
- Package-direction violations in tests were removed rather than excepted: core relation/thread contracts use local SDK-authored test Profiles, while the bundled `communication.message` Profile-to-core-registry integration contract lives under repository verification.
- CLI directly declares its SDK and Zod test-contract imports. Core removed unused `citty`, `fdir`, `file-type`, `google-auth-library`, `ignore`, `letterparser`, and `linkedom`; Adapters removed unused `linkedom`; root removed the obsolete `drizzle-kit` tool. The stale root/core/Turbo `db:generate` path is gone, and canonical migration/schema tests remain the database drift gate.
- The lockfile was regenerated with Bun 1.3.14. CI and `just install` use `bun install --frozen-lockfile`; CI now runs a real package build and the dependency verifier.
- `IMPLEMENTATION.md` records owner-based module locality and repository-level integration-test placement. Affected package/verifier codemaps describe the current seams.

## Verification

Passed on the settled Slice 5 snapshot:

```text
bun test ./scripts/verify/package-dependencies.test.ts ./scripts/verify/communication-message-profile.test.ts
bun run scripts/verify/package-dependencies.ts
bun test ./scripts/verify/module-architecture.test.ts ./scripts/verify/agent-howtos.test.ts
bun run scripts/verify/architecture-lint.ts
bun run scripts/verify/exports-map.ts
bun install --frozen-lockfile
bun run build
bun test --path-ignore-patterns '__none__' ./apps/cli/src/e2e/compiled-skills.e2e.test.ts ./apps/cli/src/e2e/external-tenders-extension.e2e.test.ts
./scripts/spikes/d3-compiled-extension/run.sh
bun run typecheck
bun run lint
bun test
bun run test:integration
bun run test:e2e
openspec validate deepen-module-architecture --strict
git diff --check
```

All commands passed. No live provider traffic was run.
