# apps/cli/src/format/

## Responsibility

Presentation and process-exit adapter layer for converting domain/CLI values into stable terminal, compact, markdown, or JSON output.

## Design / patterns

- Formatters are pure string builders; callers own stdout. `exit.ts` is the process adapter and writes errors to stderr through `runWithExit`.
- Text tables use `cli-table3`; compact modes use tab/newline-delimited records; JSON paths use explicit projection or `JSON.stringify`.
- `mapErrorToExit` maps core error classes/codes to numeric process outcomes, while `runWithExit(handler)` catches errors and assigns `process.exitCode`.
- `grants.ts` is a compatibility re-export of `auth.ts`; other modules are imported directly.

## Data & control flow

Handlers pass domain rows/descriptions to focused formatters: `action.ts` Actions, `artifact.ts` Artifacts, `auth.ts` grants, `realm.ts` Realms, `source.ts` Sources, `status.ts` status rows, `registry.ts` registry descriptions, `extensions.ts` Extension listings, `skills.ts` skill records/documents, and `secrets.ts` migration results. The formatter returns a string for the handler to print. Handler failures flow through `mapErrorToExit` or `runWithExit` to stderr and `process.exitCode`.

## Integration points

- Consumed by `apps/cli/src/main.ts`, modules under `apps/cli/src/commands/`, and handlers under `apps/cli/src/auth/`, `source/`, and `sync/`.
- Inputs come from `@ctxindex/core/errors`, `/realm`, `/registry`, `/secrets`, `/source`, and `/sync`, plus skill types from `apps/cli/src/skills/loader.ts`.
- `registry.ts` is a stable facade over `registry-projection.ts`, shared structural `registry-schema.ts`, and independent `registry-text.ts`/`registry-markdown.ts` renderers; `extensions.ts` owns deterministic Extension listings.
