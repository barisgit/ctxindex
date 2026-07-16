# packages/core/src/migrations/

## Responsibility

Publishes the immutable core database migration manifest consumed by storage initialization.

## Design

`index.ts` statically imports `packages/core/migrations/0000_init.sql` as text, references the package-owned ambient SQL module type, and exposes `coreMigrations` as a const manifest with a namespace, ordered migration list, and dedicated `ctxindex_migrations_core` tracking table.

## Data & control flow

At module load, Bun supplies the SQL file as text. `packages/core/src/storage/migrator.ts` reads `coreMigrations`, applies its ordered entries, and records applied names under the manifest's migration table.

## Integration points

- Sole consumer: `packages/core/src/storage/migrator.ts`.
- SQL source: `packages/core/migrations/0000_init.sql`.
- The manifest shape is data-only; migration execution and database access remain in `packages/core/src/storage/`.
