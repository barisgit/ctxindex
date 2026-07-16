# Provider Actions Specification

## Purpose
Define typed, Source-bound provider Actions while limiting V1 email mutations to reversible Draft creation and replacement.

## Requirements

### Requirement: Typed Profile Action contracts and Adapter bindings
For V1, Profiles SHALL support declarations of the typed provider Actions defined by SPEC §3a and §10g, including stable id, input schema, output contract, effect classification, documentation, and examples. Adapters SHALL bind implementations only for declared Actions of supported Profiles, and registry validation MUST reject declared-but-unimplemented, undeclared, or schema-incompatible bindings.

#### Scenario: Valid Action binding becomes available
- **WHEN** a loaded Adapter binds an implementation compatible with an Action declared by a supported Profile
- **THEN** the registry exposes that Action as available through Sources using the Adapter

#### Scenario: Incompatible Action binding is rejected
- **WHEN** an Adapter Action binding does not match the declared Profile Action contract
- **THEN** registry construction rejects the binding before provider I/O is possible

### Requirement: Registry-derived Action describe and run
For V1, `action describe <action-id>` SHALL derive schema, documentation, effect, and Source availability from loaded registries. `action run <action-id>` MUST require an explicit Source, validate the complete input before provider I/O, execute only through that Source's Adapter and linked Grant, and return the declared normalized result with a Resource Ref where applicable.

#### Scenario: Action description reports Source availability
- **WHEN** a caller describes a loaded Action with a Source selection
- **THEN** the output reports the registry-derived input contract and whether that Source's Adapter implements it

#### Scenario: Invalid input causes no provider I/O
- **WHEN** a caller runs an Action with input that fails the Profile Action schema
- **THEN** the command returns a usage error before invoking the Adapter

#### Scenario: Unsupported Source cannot run Action
- **WHEN** a caller runs an Action through a Source whose Adapter does not bind it
- **THEN** execution fails with an actionable unsupported-operation error and no provider mutation occurs

### Requirement: V1 email Draft Actions
For V1, the system SHALL implement exactly the reversible provider-persisted email Actions `communication.message.draft.create` and `communication.message.draft.update`. Each Action MUST require an explicit mailbox Source, persist the Draft through that Source and authentication boundary, and return the resulting normalized `communication.message` Resource Ref.

#### Scenario: Draft is created at the provider
- **WHEN** valid create input is run through an explicit mailbox Source
- **THEN** the Adapter persists a provider Draft and returns its normalized `communication.message` Resource and stable Ref

#### Scenario: Existing Draft is updated at the provider
- **WHEN** valid update input identifies an existing provider Draft through an explicit mailbox Source
- **THEN** the Adapter updates that Draft and returns the resulting normalized Resource and stable Ref

### Requirement: Consequential mutations remain deferred
For V1, the system MUST NOT implement email sending, other irreversible provider mutations, arbitrary Extension commands, or agent workflow policy. Text composed only in an agent conversation MUST NOT be represented as a Draft until a Draft Action persists it at the provider.

#### Scenario: Sending is unavailable
- **WHEN** a caller inspects or invokes available V1 Actions
- **THEN** no email-send or other irreversible provider Action is available

#### Scenario: Conversation text is not provider state
- **WHEN** an agent composes message text without running a Draft Action
- **THEN** ctxindex creates no Draft Resource or provider mutation
