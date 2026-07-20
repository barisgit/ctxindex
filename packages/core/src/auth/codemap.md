# packages/core/src/auth/

## Responsibility

Owns provider-neutral Account authorization, private one-stable-Grant lifecycle, OAuth App config snapshotting, token refresh, identity discovery, all-loaded-Adapter scope derivation, PKCE loopback, compatibility, and bounded OAuth HTTP access.

## Design / patterns

- `authorize-provider.ts` resolves one exact OAuth App label, derives Provider base scopes plus every loaded same-provider Adapter access scope, and completes loopback consent through the imported Provider definition.
- `selection.ts` owns deterministic scope union; OAuth modules isolate endpoints, token/identity validation, and host policy.
- `createAuthService()` writes typed Grant refs plus a private snapshot of the selected App config, composes Account upsert transactionally, updates reauthorization in place under the same Grant ID, and cleans replaced refs best-effort.
- Refresh always uses the Grant-owned App snapshot and token refs, never the current App inventory or environment.

## Data & control flow

1. Authorization resolves an exact Provider/App pair and all-loaded scope union, completes loopback token/identity flow, then writes the App snapshot and token refs.
2. Account upsert and Grant insert/update commit together; failures clean new refs, successful reauthorization cleans old refs while preserving Source bindings.
3. Account removal marks bound Sources `needs_auth`, upserts sync state, clears `grant_id`, deletes Grant/Account transactionally, and cleans refs.
4. Provider operations reuse unexpired access or refresh through the declared endpoint with one safe ref rotation.

## Integration points

Consumes complete-registry Provider/OAuth App declarations, `oauth-app/`, `account/`, secrets, storage, config test routing, logging, and `net/egressFetch`. Used by CLI Account/Source workflows and provider contexts.
