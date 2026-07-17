# apps/cli/src/client/

## Responsibility

Orchestrates CLI lifecycle for persisted provider-scoped OAuth client records without accepting secret values on argv.

## Design / patterns

- Add validates `getOAuthProvider(provider)` before reading declared environment names or opening storage.
- List/remove expose only provider, label, and timestamps; no secret refs/values enter output.
- The handler dispatches the closed `ClientArgs` union, maps stable exits, and always closes opened dependencies.

## Data & control flow

`client add <provider> --from-env` reads declared client ID and optional/required secret once and delegates typed persistence to `OAuthClientService`. List reads deterministic metadata. Remove scopes label lookup by provider, deletes metadata, and cleans the client's refs.

## Integration points

Called by `commands/client.ts`, parsed by `args/client.ts`, rendered by `format/client.ts`, and wired through `loadCliDefinitions`, `openDeps`, and `@ctxindex/core/client`.
