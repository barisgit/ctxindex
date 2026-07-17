# packages/core/src/schema/

## Responsibility

Declares the core SQLite relational model as Drizzle tables for access layering, Realms/Sources, generic Resources, relations/Artifacts, and sync bookkeeping.

## Design / patterns

- `oauth_clients` stores provider, provider-scoped unique label, typed client refs, and timestamps.
- Accounts keep `(provider, external_user_id)` uniqueness plus a globally unique required label; Grants have unique `account_id` so each Account owns one stable Grant.
- Sources replace optional `display_name` with one required globally unique `label` and retain nullable explicit Grant binding.
- Foreign keys/checks/unique constraints encode ownership, cardinality, and cleanup; generic Resource-owned rows cascade from Source/Resource roots.

## Data & control flow

Client import creates `oauth_clients`; Account authorization creates/updates Account identity and one Grant; Source setup binds a Realm, Adapter version, label, config, routing, and optional Grant. Account removal clears Source bindings before Grant deletion. Sync and ingestion populate generic Resource/search/relation/Artifact tables.

## Integration points

Exported by `@ctxindex/core/schema`; consumed by migrations and runtime SQL in client, account, auth, source, resource, search, relation, Artifact, and sync capabilities.
