# apps/cli/src/source/

## Responsibility

Orchestrates labeled Source add/list/remove and provider-scoped Account/Grant selection.

## Design / patterns

- `handleSourceCommand` resolves one Adapter by stable id, validates its config schema, resolves optional authorization and Source references, then delegates persistence without an Adapter version selector.
- `resolveSourceGrant` derives authorization from the Adapter's optional imported Provider and access scopes, then applies exact same-provider Account label -> Account ID precedence and scope compatibility to select the internal Grant.
- Providerless and `none`-Provider Adapters need no Grant and reject explicit Account selection; OAuth2 Provider-backed Adapters require one compatible result.

## Data & control flow

Add loads registry descriptions, then reloads the open dependency registry before reparsing generated config options so locally persisted OAuth Apps are represented. It resolves the id-addressed Adapter and optional compatible Account authorization, then passes Realm, label, config, routing, and the internally selected Grant ID to `SourceService`. Source rows and add input carry `adapter_id` only. Omitted labels default in core. List renders labels; remove resolves label or ID before deletion.

## Integration points

Called by `commands/source.ts`; uses `args/source.ts`, `definitions.ts`, `deps.ts`, source formatters, `AuthService`, and `SourceService`.
