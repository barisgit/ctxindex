# packages/core/src/client/

## Responsibility

Owns labeled OAuth client metadata, typed secret persistence/cleanup, safe inventory/removal, and provider-scoped client resolution for Account authorization.

## Design / patterns

- `createOAuthClientService()` writes ID/secret values through `SecretsStore`, stores only typed refs plus metadata, and cleans new refs on failure.
- Labels default verbatim to provider ID and are unique per provider; collision is a hard usage error.
- `resolveOAuthClient()` auto-selects one provider client, directs zero to `client add`, and requires an exact label for several records.

## Data & control flow

Client import writes typed refs before metadata. Account authorization loads one selected client's values and Grant persistence writes independent Grant-owned refs, so removing the client record does not break existing refresh.

## Integration points

Exported by `@ctxindex/core/client`; depends on storage, errors, and secrets. Consumed by CLI composition and `authorizeProvider`; metadata is declared in `schema/oauth_clients.ts`.
