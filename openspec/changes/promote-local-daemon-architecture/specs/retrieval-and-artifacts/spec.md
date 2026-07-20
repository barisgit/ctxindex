## ADDED Requirements

### Requirement: Artifact and export byte transfer is daemon-coordinated
Artifact descriptor listing, download, export, and managed-byte purge bookkeeping MUST execute through daemon-owned application services. Ordinary JSON RPC values MUST NOT embed unbounded bytes or expose raw host paths. Byte transfer MUST use a bounded owner-private local transport with cancellation, size enforcement, atomic output behavior, and deterministic cleanup.

#### Scenario: Agent downloads an Artifact
- **WHEN** an agent requests an Artifact download while the daemon owns the runtime
- **THEN** the daemon resolves and authorizes the Artifact and coordinates bounded byte transfer
- **THEN** the CLI receives no provider credential, cache path, or partial-success output
