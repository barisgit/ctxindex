# apps/cli/src/commands/

## Responsibility

Defines the citty command tree and thin per-verb handlers that connect parsing, CLI dependencies, core services, formatting, and exit-code handling.

## Design / patterns

- Each command exports a `defineCommand` descriptor; compound verbs expose nested `subCommands`.
- `handle*Command(args)` functions parse discriminated argv results, open dependencies, delegate domain work, format output, and return numeric exit codes.
- `runWithExit` adapts handlers to citty and `mapErrorToExit` centralizes thrown-error translation.
- Optional dependency factories on handlers support substitution without moving business logic into the CLI layer.
- `db.ts` alone retains module state: `getDb()` lazily opens and migrates a shared database handle.

## Data & control flow

`apps/cli/src/main.ts` registers command descriptors, citty invokes a command `run`, and the command forwards argv to its handler. The handler calls a parser in `../args/`, opens `../deps.ts` or a focused service, invokes `@ctxindex/core/*`, renders through `../format/`, closes resources, and returns an exit code consumed by `runWithExit`.

Delegating adapters are `auth.ts` to `auth/handle-auth-command.ts`, `source.ts` to `source/handle-source-command.ts`, and `sync.ts` to `sync/runner.ts`.

## Integration points

- `action.ts`: `describeAction`, `runAction`; `artifact.ts`/`purge.ts`: `ArtifactService`; `export.ts`: `exportSourceResource`.
- `describe.ts`/`extensions.ts`: `loadCliDefinitions` and registry formatters; `get.ts`: `getSourceResource`; `search.ts`: `SearchPlanner`.
- `realm.ts`: `realmService`; `status.ts`: `sourceService`; `thread.ts`: `ThreadService`; `secrets.ts`: secrets/config services.
- `skills.ts`: `resolveBundledSkills`, `listSkills`, and `getSkillContent`; `init.ts`/`db.ts`: core storage bootstrap/open/migration functions.
- All command descriptors are consumed by `apps/cli/src/main.ts`; shared wiring lives in `apps/cli/src/deps.ts`, `definitions.ts`, `args/`, and `format/`.
