# scripts/verify/

## Responsibility

Contains executable static and runtime verification gates for CLI layering, framework usage, environment access, package exports, and non-interactive operation. Each selected script exits nonzero on a contract violation for CI or local gate composition.

## Design

- `architecture-lint.ts` is the central source-policy linter. Exported `lintFiles()` reports typed `Violation` records for banned database/deep imports, command-layer allowlist breaches, raw SQL, and provider URL literals; `// noqa: architecture-lint` provides line-local suppression.
- `cli-framework-citty.ts` combines source assertions with spawned CLI smoke checks to enforce Citty command wiring, generated help/version output, and nonzero handling of unknown commands.
- `cli-no-business-logic.ts` scans non-exempt CLI source for storage, SQL, secret-backend, OAuth, and provider-I/O markers.
- `cli-thin-lines.ts` discovers every production `apps/cli/src/commands/*.ts` file by rule and enforces the 80-line nonblank, non-import budget; optional explicit paths remain available for focused invocation.
- `env-loader.ts` enforces centralized `CTXINDEX_`/`XDG_` reads and injects a temporary synthetic violation to prove the audit detects failures.
- `exports-map.ts` validates required `@ctxindex/core` subpath declarations, target files, runtime resolution, and absence of deep core imports.
- `no-prompts-static.ts` rejects prompt libraries and direct stdin/readline use in production CLI TypeScript; `agent-howtos.test.ts` verifies repository-owned agent guidance against the real CLI command surface.
- `package-dependencies.ts` uses the TypeScript AST to discover imports in every app/package production and colocated test file, then enforces direct runtime declarations, dependency use, and workspace direction. `communication-message-profile.test.ts` owns the bundled message Profile-to-registry contract; `calendar-event-profile.integration.test.ts` verifies the provider-neutral calendar Profile through generic registry, storage, search, exact-Realm, retrieval/cache, and relation paths using fake Adapters.
- `full-test-suite.sh` forces `NODE_ENV=test` and a temporary `CTXINDEX_KEYTAR_MOCK_FILE` before test discovery, preventing missed sandbox wiring from touching the user's native Keychain; discovery requires every Adapter and CLI e2e test file to appear in the run.
- `module-architecture.test.ts` owns green secret and provider-neutral boundaries: one explicit backend-selection owner, no fallback/literal-secret CLI, no legacy service, mandatory Keychain mock guarding in tests, Profile-owned and declaratively bundled calendar vocabulary, read-only Google Calendar scope/routes, provider modules outside core/CLI, no literal long-lived auth inputs, and public host declarations.
- `multi-provider-architecture.red.ts` remains intentionally red only for later Microsoft mailbox/calendar Adapter modules; its no-send production assertion already passes. Google Calendar ownership/read-only checks, calendar vocabulary ownership/bundling, provider-neutral core/CLI ownership, endpoint isolation, credential-input restrictions, and public host declarations have graduated to green verification.

## Flow

1. A verifier resolves the repository root and discovers or receives its target files.
2. It reads source/manifests, applies deterministic pattern or structural checks, and, where required, spawns the CLI or imports package subpaths.
3. Findings are printed with file/line context; each script exits `1` on violations.
4. Successful gates print a short contract-specific status line and exit `0`.

## Integration

- Scans `apps/cli/src`, `apps/cli/bin/ctxindex.mjs`, `packages/core`, `packages/adapters`, and selected `scripts` paths according to each gate.
- `cli-framework-citty.ts` invokes the Bun CLI entry point and inspects command modules under `apps/cli/src/commands/`.
- `exports-map.ts` consumes `packages/core/package.json` and imports `@ctxindex/core/{auth,sync,realm,source,search,errors}`.
- All scripts target Bun APIs/runtime and expose process exit status as their integration contract for higher-level verification runners.
- Red contract files are invoked only by exact path while implementation is pending; normal test discovery remains green, and final gates require every red assertion to be promoted or removed.
