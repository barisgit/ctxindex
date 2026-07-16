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
- `no-prompts-static.ts` rejects prompt libraries and direct stdin/readline use in production CLI TypeScript.

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
