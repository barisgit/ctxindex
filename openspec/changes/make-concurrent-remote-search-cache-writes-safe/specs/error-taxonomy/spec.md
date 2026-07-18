## ADDED Requirements

### Requirement: Storage contention normalization
Exhaustion of the configured SQLite write-contention bound SHALL surface as error code `storage_busy` with an actionable retry diagnostic at database setup, schema migration, and Resource batch boundaries. Raw `SQLITE_BUSY`, `SQLITE_LOCKED`, and database-lock messages MUST NOT cross those normalized boundaries. A terminal `storage_busy` error SHALL use the existing exit `50`, while optional remote-search cache exhaustion SHALL use a warning and successful exit `0`. If cancellation is signalled, the operation's existing cancellation outcome SHALL take precedence over `storage_busy`.

#### Scenario: Terminal contention uses the existing failure exit
- **WHEN** a required storage operation exhausts the write-contention bound without cancellation
- **THEN** the CLI reports `storage_busy` through exit 50 with an actionable retry diagnostic

#### Scenario: Raw SQLite contention is hidden
- **WHEN** SQLite reports busy or locked during database setup, schema migration, or Resource batch acquisition
- **THEN** user-visible errors and warnings identify `storage_busy` without raw SQLite error codes or database-lock text

#### Scenario: Cancelled contention retains cancellation taxonomy
- **WHEN** cancellation is signalled while a storage operation is contended and the operation returns control
- **THEN** the operation retains its existing cancellation result rather than reporting `storage_busy`
