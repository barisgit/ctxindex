## MODIFIED Requirements

### Requirement: Backup and export stability
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

The baseline supported backup procedure is: stop active syncs and, when a daemon owns the canonical SQLite path, request clean shutdown and wait for active operations to settle, SQLite to close, and both database and lifecycle leases to release; then copy the SQLite file and the secrets store file if one is used. Endpoint disappearance or shutdown timeout is insufficient. Copying the database while the daemon owns it is not supported.

ctxindex MAY ship an `export` command. Any such export format MUST be either declared stable in a release document or marked unstable. Unstable export formats SHOULD NOT be relied on for cross-version restore.

Beginning with the first released V1 schema, core-owned migrations MUST keep `ctxindex.sqlite` upgradable between released versions. Prototype databases created before V1 have no migration guarantee, and Adapters MUST NOT register migration namespaces.

#### Scenario: Backup and export behavior remains explicit
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: Daemon-backed database is copied safely
- **WHEN** an operator follows the baseline backup procedure while a daemon owns the canonical SQLite path
- **THEN** the copy begins only after clean shutdown has settled active operations, closed SQLite, and released both leases
