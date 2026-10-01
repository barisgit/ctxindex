## ADDED Requirements

### Requirement: Daemon-owned Extension registry lifetime
The daemon SHALL complete the existing Extension loading and validation contract once during startup and SHALL establish one active registry before reporting ready. Business requests MUST use that daemon-owned registry and MUST NOT import, validate, or activate Extensions per request. Configuration or Extension-file changes made after readiness MUST NOT alter the active registry until a later daemon start.

#### Scenario: Repeated requests reuse one registry
- **WHEN** multiple business requests execute during one daemon lifetime
- **THEN** they use the same validated active registry without reloading Extension modules

#### Scenario: Extension change waits for restart
- **WHEN** Extension configuration or local Extension files change after the daemon reports ready
- **THEN** the active registry remains unchanged until the daemon is shut down and a later daemon starts

### Requirement: Daemon startup performs no Extension acquisition
Daemon startup and request handling MUST load only bundled Extensions and configured Extension material already present locally under the existing Extension loading contracts. They MUST NOT discover, fetch, install, update, or otherwise acquire Extension Catalogs or Extension code. Missing or invalid configured Extension material SHALL follow the existing diagnostic and degraded-availability contracts without triggering acquisition.

#### Scenario: Installed Extension material is available locally
- **WHEN** daemon startup resolves configured Extension material that is already present locally
- **THEN** it loads and validates that material without contacting or updating a catalog

#### Scenario: Configured Extension material is absent
- **WHEN** configured Extension material is not present locally during daemon startup
- **THEN** startup emits the existing loading diagnostic and performs no catalog or Extension acquisition
