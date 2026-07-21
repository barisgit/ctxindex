# scripts/verify/

## Responsibility

Contains executable verification gates for CLI layering, framework usage, package exports, network egress, and non-interactive operation. Repository contract tests live separately under `tests/tooling/verify/`.

## Design

- `architecture-lint.ts` is the central source-policy linter. Exported `lintFiles()` reports typed `Violation` records for banned database/deep imports, command-layer allowlist breaches, raw SQL, and provider URL literals; `// noqa: architecture-lint` provides line-local suppression.
- `cli-framework-citty.ts` combines source assertions with spawned CLI smoke checks to enforce Citty command wiring, generated OAuth App/Account help and version output, and nonzero handling of unknown commands.
- `cli-no-business-logic.ts` scans non-exempt CLI source for storage, SQL, secret-backend, OAuth, and provider-I/O markers.
- `cli-thin-lines.ts` discovers every production `apps/cli/src/commands/*.ts` file by rule and enforces the 80-line nonblank, non-import budget; optional explicit paths remain available for focused invocation.
- `exports-map.ts` validates required `@ctxindex/core` subpath declarations, target files, runtime resolution, and absence of deep core imports.
- `tests/tooling/verify/repo-development-skill.test.ts` verifies the repository-development skill's CLI walkthrough against the real CLI command surface and guards the bundled skill's concise live-discovery orientation against static command or schema inventories.
- `github-actions-ci.test.ts` parses the pull-request workflow and locks the three dependency-independent fast, integration, and E2E jobs, their exact root commands, frozen install, Bun pin, least privilege, cancellation, and pinned Bun/Turbo cache action.
- `cli-package.test.ts` locks the private root/public unscoped CLI manifest boundary, Bun package bundle command, closed runtime workspace graph, and verified contributor `bun link` documentation.
- `package-dependencies.ts` follows root-manifest workspace patterns ending in `/*`, currently discovering `apps/*`, `packages/*`, and `examples/*`. It recursively scans JavaScript/TypeScript production and test files while excluding generated/build directories and nested package roots, then uses the TypeScript AST to enforce declared imports and workspace direction. Runtime `dependencies` are additionally checked for use and restricted external direction; `devDependencies` satisfy test imports without being treated as unused runtime requirements. Apps and examples may depend on public packages, while package-to-package edges retain the architecture allowlist. Workspace-local `tsconfig.json` paths, React JSX runtime imports, Fumadocs' framework-provided `mdx/types`, and declared framework peers receive their documented normalization. `communication-message-profile.test.ts` owns the bundled message Profile-to-registry contract; `calendar-event-profile.integration.test.ts` verifies the provider-neutral calendar Profile through generic registry, storage, search, exact-Realm, retrieval/cache, and relation paths using fake Adapters.
- `profile-codemap-mailbox-parity.test.ts` guards the Profile codemaps' bundled Adapter parity claims for Google and Microsoft mailbox/calendar integrations and the local-directory Adapter.
- Workspace manifests own unit tests, while packages with integration or E2E coverage own those tasks directly. Root `//#test:tooling` and `//#test:integration:tooling` tasks cover repository tests. Each command forces `NODE_ENV=test` and a lane-specific workspace-local `CTXINDEX_KEYTAR_MOCK_FILE`, preventing automated tests from touching the user's native Keychain without disabling Turbo caching. Core alone serializes its in-process unit tests because its Keychain guard tests temporarily delete and restore those process-global environment keys; Turbo still runs the Core task alongside the other package tasks.
- `module-architecture.test.ts` owns green secret and provider-neutral boundaries: one explicit backend-selection owner, no fallback/literal-secret CLI, no legacy service, mandatory Keychain mock guarding in tests, Profile-owned and declaratively bundled calendar vocabulary, provider-module ownership and registration for Google/Microsoft mailbox/calendar Adapters, read-only calendar scopes/routes, provider-neutral core/CLI, no literal long-lived client/account inputs, an exact approved provider-host set, and dynamic rejection of send-like scopes or Action ids.
- `network-egress.sh` is a cacheable static gate over production Core, Adapter, and CLI roots. It scopes literal-host and raw/alternate-client scans, preserves narrow Core/daemon exceptions, discovers every production Adapter `context.fetch` caller and its co-located test, and fixes test-only mock endpoint ownership. Runtime coverage remains in the ordinary unit, integration, and E2E Turbo lanes instead of being rerun by this script.
- The exhausted `multi-provider-architecture.red.ts` contract was deleted after its Microsoft mailbox/calendar ownership, registration, and no-send assertions graduated into `module-architecture.test.ts`; no red architecture contract remains.

## Flow

1. A verifier resolves the repository root and discovers or receives its target files.
2. It reads source/manifests, applies deterministic pattern or structural checks, and, where required, spawns the CLI or imports package subpaths.
3. Findings are printed with file/line context; each script exits `1` on violations.
4. Successful gates print a short contract-specific status line and exit `0`.

## Integration

- Scans `apps/cli/src`, `apps/cli/bin/ctxindex.mjs`, `apps/web`, root-declared package/example workspaces, `packages/core`, `packages/adapters`, and selected `scripts` paths according to each gate.
- `cli-framework-citty.ts` invokes the Bun CLI entry point and inspects command modules under `apps/cli/src/commands/`.
- `exports-map.ts` consumes `packages/core/package.json` and imports `@ctxindex/core/{auth,sync,realm,source,search,errors}`.
- All scripts target Bun APIs/runtime and expose process exit status as their integration contract for higher-level verification runners.
- Architecture contracts run through `tests/tooling/verify/`; milestone-only red assertions are removed once promoted to the green module-architecture suite.
