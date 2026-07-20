# apps/cli/src/oauth-app/

## Responsibility

Orchestrates local OAuth App add/list/remove commands without exposing configuration or secret references.

## Design / patterns

- `handle-oauth-app-command.ts` is the workflow boundary behind the thin command descriptor.
- Add acquires one retained direct database owner before Extension imports, reads local OAuth App identities and loads one complete-registry snapshot under that owner, then reads only Provider-declared `registration.environment` names when `--from-env` is selected. It validates the resulting config before opening mutable dependencies and reuses the exact snapshot and owner for collision checking and secret-backed persistence.
- Inventory and removal use the safe OAuth App service projection keyed by exact `(provider, label)` identity.

## Data & control flow

Arguments are parsed by `args/oauth-app.ts`. Add retains shared ownership across definition loading, initialization validation, dependency composition, collision rejection, and `OAuthAppService` persistence; all failure paths release it. List and remove acquire ownership inside ordinary dependency composition before definitions load, operate on local/Extension App inventory, and render through `format/oauth-app.ts`.

## Integration points

Registered by `commands/oauth-app.ts`; depends on CLI definitions/dependencies and `@ctxindex/core/oauth-app` plus the environment-reading boundary in core config.
