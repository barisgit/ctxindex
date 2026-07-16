# apps/cli/src/

## Responsibility

Implements the `@ctxindex/cli` application layer: defines the citty command surface, parses argv, assembles core services, delegates domain operations, and renders stable terminal output and exit codes.

## Design / patterns

- `main.ts` is the composition root and command registry; `rootCommand` binds the descriptors from `commands/`, including the Account inventory surface, `runCli` adapts citty's process behavior to a returned numeric exit code, and its static `INTERFACE` help block points agents to progressive registry discovery without activating Extensions.
- `args/` is a pure parsing layer built around discriminated unions; `commands/` contains thin Citty declarations/adapters; `action/` and `artifact/` own their multi-step workflows; `format/` contains presentation and error-to-exit adapters.
- `deps.ts` is the dependency-composition boundary. A shared secret runtime constructs both concrete backends, the typed `SecretVault`, and `SecretBackendManager`; `loadAuthDefinitionDeps` loads provider declarations before auth validation, `openDeps` injects the loaded Adapter registry and vault into auth, `openAccountDeps` exposes only `AccountService` over the database, and `openSecretDeps` exposes only backend management to the light secrets command.
- `definitions.ts` centralizes config and extension loading through `loadCliDefinitions`; `action/`, `artifact/`, `auth/`, `source/`, and `sync/` isolate multi-step workflows, while `skills/` abstracts filesystem versus embedded skill content.

## Data & control flow

1. `runCli(args)` in `main.ts` extracts global `--log-level`, configures `deps.ts#setCliLogLevel`, and invokes citty `runMain(rootCommand, ...)`.
2. Citty selects a descriptor from `commands/`; its handler parses remaining argv through the matching `args/` module.
3. Handlers call `openDeps()`, a light dependency opener such as `openAccountDeps()`/`openSecretDeps()`, or a focused core service, then delegate business behavior to `@ctxindex/core/*`; source and extension capabilities are supplied by `@ctxindex/adapters` through the loaded registry. Fresh initialization probes Keychain before selecting file storage, but normal secret writes never fall back from the configured backend.
4. Results pass through `format/` and are written to stdout. Errors pass through `format/exit.ts#mapErrorToExit` or `runWithExit`, and `runCli` returns the resulting process code.
5. Citty help appends only a styled discovery/detail pointer. The dedicated `describe` command activates definitions, emits redacted Extension diagnostics, and selects compact, exact-detail, or explicit-full registry output.

## Integration points

- Executed by `apps/cli/bin/ctxindex.mjs`; exported as the package entry through `apps/cli/package.json` (`./src/main.ts`).
- Depends on `@ctxindex/core` service/config/storage subpaths, built-in extensions from `@ctxindex/adapters`, and citty; `format/` uses `cli-table3`.
- Detailed submaps: `apps/cli/src/action/codemap.md`, `args/codemap.md`, `artifact/codemap.md`, `commands/codemap.md`, `format/codemap.md`, `auth/codemap.md`, `source/codemap.md`, `sync/codemap.md`, and `skills/codemap.md`.
