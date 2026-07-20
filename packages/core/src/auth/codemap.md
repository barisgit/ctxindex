# packages/core/src/auth/

## Responsibility

Owns provider-neutral Account authorization, private one-stable-Grant lifecycle, OAuth App config snapshotting, token refresh, identity discovery, all-loaded-Adapter scope derivation, PKCE loopback, compatibility, and bounded OAuth HTTP access.

## Design / patterns

- `authorize-provider.ts` resolves one exact OAuth App label, derives Provider base scopes plus every loaded same-provider Adapter access scope, and completes loopback consent through the imported Provider definition.
- `selection.ts` owns deterministic scope union; OAuth modules isolate endpoints, token/identity validation, and host policy.
- `createAuthService()` writes typed Grant refs plus a private snapshot of the selected App config, composes Account upsert transactionally, serializes mutations per exact Account identity, updates reauthorization in place under the same Grant ID, and reports cleanup-pending warnings with only Provider id, Grant id, lifecycle phase, and failed-entry count.
- Refresh always uses the Grant-owned App snapshot and token refs, never the current App inventory or environment.

## Data & control flow

1. Authorization resolves an exact Provider/App pair and all-loaded scope union, completes loopback token/identity flow, then writes the App snapshot and token refs.
2. Account upsert and Grant insert/update commit together; same-Account authorization, refresh, and removal re-read current state in one process-wide keyed order. Failures attempt cleanup without replacing the original failure, while successful reauthorization preserves Source bindings and its committed replacement even when old-ref cleanup warns.
3. Account removal revalidates its exact label after entering the Account mutation queue, then marks bound Sources `needs_auth`, upserts sync state, clears `grant_id`, and deletes Grant/Account transactionally before cleaning refs. The commit remains authoritative when cleanup warns, and physical deletion is idempotently retryable.
4. Provider operations reuse unexpired access or refresh through the declared endpoint with one safe ref rotation.

## Integration points

Consumes complete-registry Provider/OAuth App declarations, `oauth-app/`, `account/`, secrets, storage, config test routing, logging, and `net/egressFetch`. Used by CLI Account/Source workflows and provider contexts.
