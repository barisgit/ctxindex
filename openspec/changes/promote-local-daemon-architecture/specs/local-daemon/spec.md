## ADDED Requirements

### Requirement: Local daemon is the normal stateful runtime owner
On an advertised platform, ctxindex MUST use one compatible local daemon as the normal owner of the canonical SQLite database, active Extension registry, runtime composition, and stateful application services. The CLI MUST remain the sole agent-facing surface and the RPC protocol MUST remain private and exact-versioned.

Daemon ownership MUST NOT become the default until every stateful command is either daemon-routed or included in a tested bootstrap/filesystem-only exception allowlist.

#### Scenario: Complete stateful command inventory is ready
- **WHEN** daemon ownership becomes the normal execution mode
- **THEN** every stateful CLI entrypoint delegates to a semantic daemon procedure or is a documented safe exception
- **THEN** no command silently falls back to direct SQLite access after selecting a daemon

### Requirement: Supported platforms fail closed without retained ownership
Each advertised operating system MUST provide process-retained shared and exclusive ownership with crash release, owner-private metadata, alias-safe canonical identity, and fail-closed acquisition. A platform without a verified implementation MUST reject daemon ownership before SQLite opens and MUST NOT be advertised as daemon-supported; until promotion supplies that backend, the existing direct CLI MUST remain usable because no daemon can own its database.

#### Scenario: Platform backend is unavailable
- **WHEN** the current platform cannot provide the verified retained-ownership semantics
- **THEN** daemon startup fails before SQLite open with a bounded actionable failure
- **THEN** direct CLI behavior remains available without claiming daemon ownership

### Requirement: Daemon registry reads return bounded value projections
The daemon MUST expose ordinary registry description and loaded/installed Extension inventory as semantic read procedures derived from the authoritative RPC contract. The implementation MUST reuse core description and inventory projections; it MUST NOT serialize a registry, executable definition, function, or generic CLI invocation. No parallel handwritten application/procedure signature list is permitted.

The description read and Source-aware Action description remain distinct operations. Inventory reads MUST reflect the daemon's immutable loaded registry and persisted installed provenance without refreshing Catalogs or replacing the active registry. The CLI retains presentation and exit policy. Diagnostic and provenance fields MUST satisfy the accepted safe-output contract; output incompatibilities require an explicit contract decision before implementation.

#### Scenario: Registry read observes an immutable daemon snapshot
- **WHEN** an initialized caller requests a registry description or Extension inventory
- **THEN** the response contains only the declared bounded values from daemon-owned projections, not a newly activated client registry

#### Scenario: Exact Extension-location output crosses the read boundary
- **WHEN** a registry read includes Extension provenance or a host-generated load diagnostic
- **THEN** only the explicitly declared bounded location fields MAY carry paths: diagnostic `path`, explicit-path provenance `path`, installed `requestedTarget`/`resolvedIdentity`, Catalog `repository`, literal `sourceLocator.module`, and installed curation `repository`/`source_locator.module`
- **THEN** credential-bearing locations, database/socket/runtime roots, secrets, raw backend errors, stacks and causes remain excluded, and structured failure schemas remain unchanged
