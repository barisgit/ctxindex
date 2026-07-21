# apps/cli/src/source/

## Responsibility

Orchestrates typed Source add/list/remove execution and provider-scoped Account/Grant selection after Citty validation.

## Design / patterns

- `commands/source.ts` builds one invocation-local `defineCtxCommand` tree. Static malformed arguments fail before route selection; generated Adapter flags and add help resolve one retained daemon/direct route and one immutable active-definition projection.
- `handleSourceCommand` consumes a discriminated typed input rather than raw argv. It converts normalized values into daemon RPC requests or direct `SourceService` calls and never owns command grammar or help text.
- Direct mode acquires one shared database owner before Extension imports, loads local OAuth App identities and one definition snapshot under it, and reuses that snapshot for generated arguments, Adapter/config validation, dependency composition, and execution.
- `resolveSourceGrant` derives authorization from the Adapter's optional imported Provider and access scopes, then applies exact same-provider Account label to Account ID precedence and scope compatibility to select the internal Grant.
- Providerless Adapters need no Grant and reject explicit Account selection; OAuth2 Provider-backed Adapters require one compatible result.

## Data & control flow

Typed Citty values enter through `SourceCommandInput`. Add normalization in `args/source.ts` maps generated config flags to JSON before transport; the handler delegates the same Realm, label, Account selector, routing, and sync policy across the selected daemon or direct boundary. Invocation cleanup closes dependencies and releases any retained direct owner even when dynamic validation prevents execution.

## Integration points

Called by `commands/source.ts`; uses `args/source.ts`, `definitions.ts`, `deps.ts`, daemon Source RPCs, Source formatters, `AuthService`, and `SourceService`.
