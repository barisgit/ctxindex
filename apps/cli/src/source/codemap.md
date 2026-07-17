# apps/cli/src/source/

## Responsibility

Orchestrates labeled Source add/list/remove and provider-scoped Account/Grant selection.

## Design / patterns

- `handleSourceCommand` validates the selected Adapter/config, resolves auth and Source references, delegates persistence, and owns cleanup.
- `resolveSourceGrant` applies exact same-provider Account label -> Account ID -> Grant ID precedence, then scope compatibility.
- Unauthenticated Adapters need no Grant; OAuth Adapters require one compatible result.

## Data & control flow

Add loads registry descriptions, parses generated config options, resolves the Adapter and Grant, and passes Realm, label, config, routing, and stable Grant ID to `SourceService`. Omitted labels default in core. List renders labels; remove resolves label or ID before deletion.

## Integration points

Called by `commands/source.ts`; uses `args/source.ts`, `definitions.ts`, `deps.ts`, source formatters, `AuthService`, and `SourceService`.
