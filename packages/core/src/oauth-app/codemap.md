# packages/core/src/oauth-app/

## Responsibility

Owns safe OAuth App inventory, secret-backed local BYOA configuration, exact App resolution, and collision enforcement across Extension and local origins.

## Design / patterns

- `createOAuthAppService()` merges immutable Extension Apps from the complete registry with local `oauth_apps` rows.
- `listLocalOAuthAppIdentities()` accepts an already-open database and returns only `(providerId, label)` pairs, or an empty inventory when a partial database has no `oauth_apps` table; ownership and database lifetime stay with the caller.
- App identity is the exact `(providerId, label)` pair; neither origin nor load order can select a duplicate winner.
- Provider registration schemas validate both Extension-supplied and decrypted local configuration.
- Inventory projects only provider, label, origin, and safe provenance; configuration and secret references remain private.

## Data & control flow

Local add validates the OAuth2 Provider and config, writes one opaque config secret, then inserts metadata with cleanup on failure. CLI identity preflight reads through its retained shared-lease database seam, while daemon startup reads through its exclusive owned database before complete-registry validation. Resolution returns the exact active Provider plus validated App config. Remove deletes metadata before best-effort secret cleanup. Authorization consumes the resolved value and snapshots its config into the Account's private Grant.

## Integration points

Depends on the complete registry, SQLite `oauth_apps`, typed secrets, and SDK OAuth App/Provider definitions. Used by CLI `oauth-app` lifecycle commands and Account authorization.
