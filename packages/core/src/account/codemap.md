# packages/core/src/account/

## Responsibility

Owns provider-neutral Account identity persistence and deterministic Account authorization-health/labeled-Source inventory.

## Design / patterns

- `upsertAccount()` validates provider, external subject, verbatim label, and verified identities.
- `(provider, external_user_id)` remains the identity key while Account labels are globally unique; reauthorization of the same identity may rename its existing Account.
- Label conflict detection and identity writes occur in one transaction so outer Grant persistence can roll back cleanly.
- Inventory uses one joined query plus deterministic in-memory grouping; it projects the Account's authorization expiry state and bound Sources, not internal Grant IDs, scopes, or App configuration.

## Data & control flow

OAuth identity discovery supplies the final default/explicit label. The service finds or creates the Account, rejects another Account holding that label, updates the same identity's label, records identities, and returns its stable ID. Inventory projects the Account's authorization expiry state and labeled bound Sources without Grant IDs, scopes, App config, or secret references.

## Integration points

Used by `AuthService` Grant upsert; depends on storage, schema Account constraints, validation errors, and Unicode code-point ordering. Exported by `@ctxindex/core/account`.
