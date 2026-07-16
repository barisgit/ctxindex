# apps/cli/src/format/

## Responsibility

Presentation and process-exit adapter layer for converting domain/CLI values into stable terminal, compact, markdown, or JSON output.

## Design / patterns

- Formatters are pure string builders; callers own stdout. `exit.ts` is the process adapter and writes errors to stderr through `runWithExit`.
- Text tables use `cli-table3`; compact modes use tab/newline-delimited records; JSON paths use explicit projection or `JSON.stringify`.
- `mapErrorToExit` maps core error classes/codes to numeric process outcomes, while `runWithExit(handler)` catches errors and assigns `process.exitCode`.

## Data & control flow

Handlers pass domain rows/descriptions to focused formatters: `account.ts` renders Account/Grant/Source inventory as hierarchical text or JSON; `action.ts` renders Actions; `artifact.ts` renders Artifacts; `auth.ts` confirms the Grant ID, provider, and exact granted scopes; `realm.ts` renders Realms; `source.ts` renders Sources; `status.ts` renders status rows; `registry.ts` renders registry descriptions; `extensions.ts` renders Extension listings; `skills.ts` renders skill records/documents; and `secrets.ts` renders value-free backend availability/reference counts plus switch copy/cleanup outcomes. The formatter returns a string for the handler to print. Handler failures flow through `mapErrorToExit` or `runWithExit` to stderr and `process.exitCode`.

## Integration points

- Consumed by `apps/cli/src/main.ts`, modules under `apps/cli/src/commands/`, and handlers under `apps/cli/src/auth/`, `source/`, and `sync/`.
- Inputs come from `@ctxindex/core/errors`, `/realm`, `/registry`, `/secrets`, `/source`, and `/sync`, plus skill types from `apps/cli/src/skills/loader.ts`.
- `registry.ts` is a stable facade over `registry-projection.ts`, shared structural `registry-schema.ts`, and independent `registry-text.ts`/`registry-markdown.ts` renderers. Source detail derives OAuth guidance from registry data: provider ID and endpoints, auth hosts, provider base scopes, Adapter scopes, environment variable names, and Provider API hosts. `extensions.ts` owns deterministic Extension listings.
