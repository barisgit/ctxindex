# packages/core/src/storage/

## Responsibility

Owns Bun SQLite database creation, runtime pragmas, first-run filesystem/bootstrap setup, and ordered application of core migrations.

## Design/patterns

- `db.ts` is the connection factory and defines `CtxindexDatabase` as `bun:sqlite` `Database`; `applyPragmas()` installs the five-second busy timeout before lock-sensitive WAL setup, then enables foreign keys and normal synchronous mode.
- `contention.ts` centrally classifies SQLite busy/locked result families and normalizes setup, migration, and Resource write exhaustion to typed `storage_busy` without exposing backend text.
- `init.ts` implements an idempotent bootstrap sequence for private application directories, default config, secret-file permissions, database opening, and migration.
- `migrator.ts` uses a migration ledger (`coreMigrations.migrationsTable`) and wraps each unapplied migration plus ledger insert in a transaction.
- Prototype/non-fresh database guards fail before applying the V1 schema rather than attempting compatibility migration.

## Data & control flow

1. `bootstrapDatabase()` creates config/data/state/cache/log directories with mode `0700`, writes config if absent, normalizes secret material to `0600`, and opens the default database.
2. `openDatabase()` creates the parent directory, opens `ctxindex.sqlite`, and applies connection pragmas; `openReadonlyDatabase()` opens an existing file without creating, migrating, or enabling write-oriented pragmas.
3. `runMigrations()` inspects the migration ledger and existing user tables, rejects prototype or unmanaged databases, creates the ledger only when absent, then applies pending `coreMigrations` transactionally; lock exhaustion is normalized through the shared storage helper.
4. Bootstrap always closes the database in `finally`; other services receive an open `CtxindexDatabase` and manage their own query lifetime.

## Integration points

- Paths/config come from `packages/core/src/paths/` and `packages/core/src/config/`; migration SQL comes from `packages/core/src/migrations/index.ts`.
- All core persistence services type against `CtxindexDatabase`, including Source, Resource, Relation, Artifact, Auth, Realm, Search, Secrets, Thread, and Sync modules.
- `apps/cli/src/direct-database.ts` wraps `bootstrapDatabase()` and direct command-scoped database open/close in retained shared lease ownership; `apps/cli/src/commands/init.ts` delegates initialization to that boundary.
- `index.ts` re-exports database, bootstrap, and migration APIs through `@ctxindex/core/storage`.
