# packages/core/src/schema/

## Responsibility

Declares the core SQLite relational model as Drizzle tables for access layering, Realms/Sources, generic Resources, relations/Artifacts, and sync bookkeeping.

## Design / patterns

- `oauth_apps` stores local BYOA metadata and one typed config reference under unique `(provider_id, label)` identity.
- Accounts keep `(provider, external_user_id)` uniqueness plus a globally unique required label; Grants have unique `account_id`, a private App-config snapshot ref, and token refs so each Account owns one self-sufficient stable Grant.
- Sources have one required globally unique `label`, one Adapter id, and a nullable explicit Grant binding; Adapter versions are not persisted.
- Foreign keys/checks/unique constraints encode ownership, cardinality, and cleanup; generic Resource-owned rows cascade from Source/Resource roots.

## Data & control flow

Local App import creates `oauth_apps`; Account authorization snapshots selected App config while creating/updating Account identity and one Grant; Source setup binds a Realm, Adapter id, label, config, routing, and optional Grant. Account removal clears Source bindings before Grant deletion. Sync and ingestion populate generic Resource/search/relation/Artifact tables.

## Integration points

Exported by `@ctxindex/core/schema`; consumed by migrations and runtime SQL in OAuth App, Account, auth, Source, resource, search, relation, Artifact, and sync capabilities.
