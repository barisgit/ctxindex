# packages/core/src/auth/

## Responsibility

Owns provider-neutral Account authorization, one-stable-Grant lifecycle, token refresh, identity discovery, all-loaded-Adapter scope derivation, PKCE loopback, compatibility, and bounded OAuth HTTP access.

## Design / patterns

- `authorize-provider.ts` resolves one persisted same-provider OAuth client, derives provider base scopes plus every loaded same-provider Adapter scope, and supports loopback or internal refresh-token environment acquisition without resolving client credentials from the environment.
- `selection.ts` owns deterministic scope union; OAuth modules isolate endpoints, token/identity validation, and host policy.
- `createAuthService()` writes typed Grant refs, composes Account upsert transactionally, updates reauthorization in place under the same Grant ID, and cleans replaced refs best-effort.
- Refresh always uses Grant-owned client refs, never runtime environment client lookup.

## Data & control flow

1. Authorization resolves provider, persisted client, and all-loaded scope union, completes the selected loopback or internal refresh-token token/identity flow, then writes fresh token/client refs.
2. Account upsert and Grant insert/update commit together; failures clean new refs, successful reauthorization cleans old refs while preserving Source bindings.
3. Account removal marks bound Sources `needs_auth`, upserts sync state, clears `grant_id`, deletes Grant/Account transactionally, and cleans refs.
4. Provider operations reuse unexpired access or refresh through the declared endpoint with one safe ref rotation.

## Integration points

Consumes registry provider declarations, `client/`, `account/`, secrets, storage, config test routing, logging, and `net/egressFetch`. Used by CLI Account/Source workflows and provider contexts.
