# apps/cli/src/source/

## Responsibility

Orchestrates labeled Source add/list/remove and provider-scoped Account/Grant selection.

## Design / patterns

- `handleSourceCommand` preflights definition-independent grammar before discovery or transport. Source add retains one selected daemon and its active registry projection from Citty argument construction through execution; a lost selector cannot trigger direct fallback. Direct mode acquires one shared database owner before Extension imports, loads local OAuth App identities and one definition snapshot under it, and reuses that exact snapshot for generated parsing, dependency composition, Adapter resolution, and execution without an Adapter version selector.
- `resolveSourceGrant` derives authorization from the Adapter's optional imported Provider and access scopes, then applies exact same-provider Account label -> Account ID precedence and scope compatibility to select the internal Grant.
- Providerless and `none`-Provider Adapters need no Grant and reject explicit Account selection; OAuth2 Provider-backed Adapters require one compatible result.

## Data & control flow

Add loads the active registry description and passes Realm, label, config, Account selector, routing, and sync choice across the selected boundary. Daemon orchestration or the direct handler resolves Adapter/config/Grant using current production semantics. Direct help and invocation-final failure cleanup release the retained owner when no handler executes. Source rows and add input carry `adapter_id` only.

## Integration points

Called by `commands/source.ts`; uses `args/source.ts`, `definitions.ts`, `deps.ts`, source formatters, `AuthService`, and `SourceService`.
