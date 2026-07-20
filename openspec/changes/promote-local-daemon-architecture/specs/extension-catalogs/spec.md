## ADDED Requirements

### Requirement: Installed Extension activation coordinates with daemon registry lifetime
Catalog acquisition and inspection MAY remain direct filesystem-only operations, but install, replacement, and uninstall that change active Extension provenance MUST coordinate with the daemon-owned registry lifecycle and any database-backed OAuth App identity validation. A running daemon MUST NOT silently continue while CLI output claims a new Extension is active.

#### Scenario: Extension install is requested while daemon is ready
- **WHEN** an install would replace active registry provenance
- **THEN** ctxindex validates the runtime-complete candidate and either coordinates a bounded activation boundary or rejects with restart guidance
- **THEN** the prior active registry remains complete on failure
