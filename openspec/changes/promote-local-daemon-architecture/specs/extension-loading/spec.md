## ADDED Requirements

### Requirement: Persisted Extension paths are launch-directory independent
Every persisted relative Extension path MUST be resolved against an explicit configuration origin and stored or projected in a canonical launch-directory-independent form before registry activation. Daemon startup from different working directories MUST load the same validated Extension graph or fail with the same bounded diagnostic.

#### Scenario: Daemon starts from another directory
- **WHEN** the configured Extension set includes a path originally supplied relative to its configuration origin
- **THEN** daemon startup resolves the same Extension independent of the daemon process working directory

### Requirement: Active registry is immutable for one daemon lifetime
The daemon MUST stage and validate the complete Extension registry before readiness and MUST retain that exact registry until shutdown. Activation changes MUST require daemon coordination and MUST NOT produce a mixed registry across requests.

#### Scenario: Installed activation changes
- **WHEN** Extension activation metadata changes
- **THEN** the running daemon either rejects the change or coordinates a bounded restart boundary
- **THEN** no admitted request observes a partially replaced registry
