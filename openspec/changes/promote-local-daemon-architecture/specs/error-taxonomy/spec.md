## ADDED Requirements

### Requirement: Promoted daemon failures omit prototype classification
Normal daemon operation MUST preserve bounded lifecycle, compatibility, ownership, cancellation, result-size, and domain failures across RPC while the CLI retains sole ownership of numeric exits. No public diagnostic MUST describe a normal command as prototype-unsupported after complete migration.

#### Scenario: Migrated command reaches an unavailable daemon
- **WHEN** a compatible daemon route was selected and becomes unreachable
- **THEN** the CLI reports bounded daemon unavailability through the stable service-failure exit without falling back or exposing transport details

#### Scenario: Normal command is supported by daemon ownership
- **WHEN** a formerly fenced stateful command is invoked after promotion
- **THEN** it executes through its semantic procedure and never emits prototype-only failure wording
