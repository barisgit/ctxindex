# apps/cli/src/oauth-app/

## Responsibility

Orchestrates local OAuth App add/list/remove commands without exposing configuration or secret references.

## Design / patterns

- `handle-oauth-app-command.ts` is the workflow boundary behind the thin command descriptor.
- Add reads only Provider-declared `registration.environment` names when `--from-env` is selected and validates the resulting config before opening mutable dependencies, then delegates collision checking and secret-backed persistence to core.
- Inventory and removal use the safe OAuth App service projection keyed by exact `(provider, label)` identity.

## Data & control flow

Arguments are parsed by `args/oauth-app.ts`. Add loads the complete definition registry, derives and schema-validates config fields from the selected Provider's registration policy, then opens dependencies, rejects label collisions, and persists through `OAuthAppService`. List and remove operate on local/Extension App inventory and render through `format/oauth-app.ts`.

## Integration points

Registered by `commands/oauth-app.ts`; depends on CLI definitions/dependencies and `@ctxindex/core/oauth-app` plus the environment-reading boundary in core config.
