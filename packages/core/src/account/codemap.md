# packages/core/src/account/

## Responsibility

Owns provider-neutral Account identity persistence and deterministic Account/Grant/Source inventory projection.

## Design / patterns

- `createAccountService()` is a database-backed service factory implementing the contracts in `types.ts`.
- `upsertAccount()` validates provider, external subject, and verified identities, then keys Accounts by `(provider, external_user_id)` and inserts identity rows idempotently in one transaction.
- `listAccountInventory()` uses one joined query and in-memory grouping to project Accounts, Grants, linked Sources, Realms, normalized scopes, and computed expiry state.
- `normalizeGrantScopes()` accepts stored string/JSON representations, deduplicates values, and sorts by Unicode code point.

## Data & control flow

OAuth identity discovery supplies an `UpsertAccountInput`; the service creates or finds the Account, optionally updates its label, and records verified identities. Inventory reads left-join Accounts through Grants and Sources to Realms, group rows by IDs, then return provider/ID-sorted nested values.

## Integration points

- `packages/core/src/auth/service.ts` delegates Account creation during Grant persistence.
- Uses `packages/core/src/storage/` for SQLite access, `schema/accounts.ts` invariants, `errors.ts` for validation failures, and `internal/code-point-order.ts` for deterministic ordering.
- Exported by `@ctxindex/core/account` and the root core barrel.
