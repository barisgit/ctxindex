# apps/cli/src/commands/

## Responsibility

Defines the citty command tree and thin per-verb handlers that connect parsing, CLI dependencies, core services, formatting, and exit-code handling.

## Design / patterns

- Each command exports a `defineCommand` descriptor; compound verbs expose nested `subCommands`.
- Small `handle*Command(args)` functions may perform bounded orchestration; multi-step Action, Artifact, auth, source, and sync workflows delegate to owned handler Modules.
- `runWithExit` adapts handlers to citty and `mapErrorToExit` centralizes thrown-error translation.
- Optional dependency factories on handlers support substitution without moving business logic into the CLI layer.
- `db.ts` alone retains module state: `getDb()` lazily opens and migrates a shared database handle.

## Data & control flow

`apps/cli/src/main.ts` registers command descriptors, citty invokes a command `run`, and the command forwards argv to its handler. The handler calls a parser in `../args/`, opens `../deps.ts` or a focused service, invokes `@ctxindex/core/*`, renders through `../format/`, closes resources, and returns an exit code consumed by `runWithExit`. `account.ts` follows this path through the light `openAccountDeps()` boundary to list Account, Grant, and bound Source inventory in text or JSON.

Delegating adapters include `action.ts` to `action/handle-action-command.ts`, `artifact.ts` to `artifact/handle-artifact-command.ts`, `auth.ts` to `auth/handle-auth-command.ts`, `source.ts` to `source/handle-source-command.ts`, and `sync.ts` to `sync/runner.ts`.

## Integration points

- `action.ts` and `artifact.ts` are Citty-only declaration adapters; `purge.ts` uses `ArtifactService`; `export.ts` uses `exportSourceResource`.
- `account.ts`: lists configured Accounts with their Grants and bound Sources through `AccountService` without loading Extensions or the full CLI dependency graph.
- `describe.ts`: loads definitions and routes compact indexes, exact-id detail, or explicit full snapshots through registry formatters; `extensions.ts`: loaded Extension listings; `get.ts`: `getSourceResource`; `search.ts`: `SearchPlanner`.
- `realm.ts`: `realmService`; `status.ts`: `sourceService`; `thread.ts`: `ThreadService`.
- `auth.ts`: declares provider-neutral `auth add` with repeatable Adapter selection and loopback/from-environment modes; `secrets.ts`: opens only `SecretBackendManager` dependencies for safe status and crash-safe backend selection; `init.ts` delegates fresh-config backend probing and persistence to core before database bootstrap.
- `skills.ts`: `resolveBundledSkills`, `listSkills`, and `getSkillContent`; `db.ts`: core storage open/migration functions.
- All command descriptors are consumed by `apps/cli/src/main.ts`; shared wiring lives in `apps/cli/src/deps.ts`, `definitions.ts`, `args/`, and `format/`.
