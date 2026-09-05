## ADDED Requirements

### Requirement: Direct Extension maintenance excludes daemon startup
The local daemon lifecycle SHALL coordinate with direct installed Extension maintenance through canonical database ownership. A direct Extension mutation MUST retain shared database ownership from before any SQLite-backed validation or installed-state mutation until all mutation work settles. Because daemon startup requires exclusive ownership of that same database, a daemon MUST NOT open SQLite or load its immutable registry during the mutation.

#### Scenario: Automatic startup races Extension maintenance
- **WHEN** a daemon startup is attempted while an Extension lifecycle command retains direct shared database ownership
- **THEN** daemon startup does not open SQLite or load an Extension registry until that direct ownership is released

#### Scenario: Graceful stop does not release early
- **WHEN** an Extension lifecycle command stops a daemon that has active work
- **THEN** mutation begins only after graceful shutdown has settled and the daemon has closed SQLite and released its ownership leases
