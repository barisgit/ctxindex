# scripts/verify/

## Responsibility

Contains executable static and runtime verification gates for CLI layering, framework usage, environment access, package exports, and non-interactive operation. Each selected script exits nonzero on a contract violation for CI or local gate composition.

## Design

- `architecture-lint.ts` is the central source-policy linter. Exported `lintFiles()` reports typed `Violation` records for banned database/deep imports, command-layer allowlist breaches, raw SQL, and provider URL literals; `// noqa: architecture-lint` provides line-local suppression.
- `cli-framework-citty.ts` combines source assertions with spawned CLI smoke checks to enforce Citty command wiring, generated OAuth App/Account help and version output, and nonzero handling of unknown commands.
- `cli.sh` probes root and workspace CLI entry points, then builds the public package bundle and verifies its version and merged `oauth-app` help surface.
- `cli-no-business-logic.ts` scans non-exempt CLI source for storage, SQL, secret-backend, OAuth, and provider-I/O markers.
- `cli-thin-lines.ts` discovers every production `apps/cli/src/commands/*.ts` file by rule and enforces the 80-line nonblank, non-import budget; optional explicit paths remain available for focused invocation.
- `env-loader.ts` enforces centralized `CTXINDEX_`/`XDG_` reads and injects a temporary synthetic violation to prove the audit detects failures.
- `exports-map.ts` validates required `@ctxindex/core` subpath declarations, target files, runtime resolution, and absence of deep core imports.
- `no-prompts-static.ts` rejects prompt libraries and direct stdin/readline use in production CLI TypeScript; `repo-development-skill.test.ts` verifies the repository-development skill's CLI walkthrough against the real CLI command surface and guards the bundled skill's concise live-discovery orientation against static command or schema inventories.
- `github-actions-ci.test.ts` parses the pull-request workflow and derives the exact ordered gate names and commands from `ci.sh`, including its frozen-lockfile install helper, while separately locking the main-branch trigger, read-only permissions, concurrency cancellation, 20-minute timeout, Bun pin, and rejection of an opaque `bun run ci` step.
- `cli-package.test.ts` locks the private root/public unscoped CLI manifest boundary, Bun package bundle command, closed runtime workspace graph, and verified contributor `bun link` documentation.
- `package-dependencies.ts` follows root-manifest workspace patterns ending in `/*`, currently discovering `apps/*`, `packages/*`, and `examples/*`. It recursively scans JavaScript/TypeScript production and test files while excluding generated/build directories and nested package roots, then uses the TypeScript AST to enforce declared imports and workspace direction. Runtime `dependencies` are additionally checked for use and restricted external direction; `devDependencies` satisfy test imports without being treated as unused runtime requirements. Apps and examples may depend on public packages, while package-to-package edges retain the architecture allowlist. Workspace-local `tsconfig.json` paths, React JSX runtime imports, Fumadocs' framework-provided `mdx/types`, and declared framework peers receive their documented normalization. `communication-message-profile.test.ts` owns the bundled message Profile-to-registry contract; `calendar-event-profile.integration.test.ts` verifies the provider-neutral calendar Profile through generic registry, storage, search, exact-Realm, retrieval/cache, and relation paths using fake Adapters.
- `profile-codemap-mailbox-parity.test.ts` guards the Profile codemaps' bundled Adapter parity claims for Google and Microsoft mailbox/calendar integrations and the local-directory Adapter.
- `full-test-suite.sh` forces `NODE_ENV=test` and a temporary `CTXINDEX_KEYTAR_MOCK_FILE` before test discovery, preventing missed sandbox wiring from touching the user's native Keychain; it serializes tests with a 30-second hosted-runner budget, and discovery requires every Adapter and CLI e2e test file, including the relocated compiled-Extension regression, to appear in the run.
- `module-architecture.test.ts` owns green secret and provider-neutral boundaries: one explicit backend-selection owner, no fallback/literal-secret CLI, no legacy service, mandatory Keychain mock guarding in tests, Profile-owned and declaratively bundled calendar vocabulary, provider-module ownership and registration for Google/Microsoft mailbox/calendar Adapters, read-only calendar scopes/routes, provider-neutral core/CLI, no literal long-lived client/account inputs, an exact approved provider-host set, and dynamic rejection of send-like scopes or Action ids.
- `network-egress.sh` scopes literal-host and raw/alternate-client scans to production runtime roots in Core, Adapters, and the CLI, with narrow exceptions for the Core chokepoint and the Unix-socket daemon transport, then discovers every production Adapter `context.fetch` caller and its co-located test. It fixes test-only mock endpoint ownership and runs the production chokepoint, linked-provider context, redaction, no-send, malformed-command zero-side-effect, compiled direct-install offline matrix, and CLI egress suites.
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
- Architecture contracts now run through normal Bun test discovery; milestone-only red assertions are removed once promoted to the green module-architecture suite.
