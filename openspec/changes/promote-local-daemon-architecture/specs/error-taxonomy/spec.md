## ADDED Requirements

### Requirement: Promoted daemon failures omit prototype classification
Normal daemon operation MUST preserve bounded lifecycle, compatibility, ownership, cancellation, result-size, and domain failures across RPC while the CLI retains sole ownership of numeric exits. No public diagnostic MUST describe a normal command as prototype-unsupported after complete migration. The private failure registry MUST NOT declare a prototype-only failure kind. A direct opener blocked by daemon database ownership MUST report the bounded `database_lease_conflict` classification through exit `50` before opening SQLite.

#### Scenario: Migrated command reaches an unavailable daemon
- **WHEN** a compatible daemon route was selected and becomes unreachable
- **THEN** the CLI reports bounded daemon unavailability through the stable service-failure exit without falling back or exposing transport details

#### Scenario: Normal command is supported by daemon ownership
- **WHEN** a formerly fenced stateful command is invoked after promotion
- **THEN** it executes through its semantic procedure and never emits prototype-only failure wording

#### Scenario: Direct opener meets daemon ownership
- **WHEN** an allowlisted direct path or the unsupported-platform conditional route attempts shared database ownership while a daemon holds the canonical database lease
- **THEN** it reports `database_lease_conflict` through exit 50 before composing a runtime or opening SQLite
