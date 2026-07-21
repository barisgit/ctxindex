# packages/core/src/realm/

## Responsibility

Defines the Realm application service and persistence-facing types for creating, querying, listing, and deleting user realms.

## Design

- `createRealmService()` is a dependency-injected service factory over `CtxindexDatabase` and `Logger`.
- `RealmService` is a synchronous CRUD port; `RealmRow` mirrors the selected `realms` columns.
- Exported `assertValidRealmSlug()` owns effect-free slug syntax so the CLI can reject malformed input before daemon ensure; valid slugs serve directly as realm IDs and are checked for uniqueness before insertion.
- Domain validation failures use `CtxindexValidationError` codes `invalid_filter` and `duplicate_realm_slug`.

## Data & control flow

1. `createRealm()` validates the slug, queries for an existing row, inserts `id/slug/label/created_at`, logs the creation, and returns `{ realmId }`.
2. `listRealms()` returns rows ordered by slug.
3. `getRealmBySlug()` and alias `findRealmBySlug()` return one row or `null`.
4. `deleteRealm()` deletes by slug and emits a debug record.

## Integration points

- Re-exported through the Realm subpath; `apps/cli/src/deps.ts` constructs the service, the Realm command uses the validator before routing, and CLI formatting consumes `RealmRow`.
- `packages/core/src/source/types.ts` accepts `RealmService` as a source-service dependency.
- Depends on `packages/core/src/storage/`, `packages/core/src/logger/`, and `packages/core/src/errors.ts`; SQL targets the `realms` table.
