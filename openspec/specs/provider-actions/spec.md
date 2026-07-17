# Provider Actions Specification

## Purpose
Define typed, Source-bound provider Actions while limiting V1 email mutations to reversible Draft creation and replacement.

## Requirements

### Requirement: Typed Profile Action contracts and Adapter bindings
For V1, Profiles SHALL support declarations of typed provider Actions under [Profile vocabulary](../profile-vocabulary/spec.md) and this provider-independent Action contract, including stable id, input schema, output contract, effect classification, documentation, and examples. Adapters SHALL bind implementations only for declared Actions of supported Profiles, and registry validation MUST reject declared-but-unimplemented, undeclared, or schema-incompatible bindings.

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
For V1, the system SHALL implement exactly the reversible provider-persisted email Actions `communication.message.draft.create` and `communication.message.draft.update`. Each Action MUST require an explicit mailbox Source, persist the Draft through that Source and authentication boundary, and return the resulting normalized `communication.message` Resource Ref. Both `google.mailbox` and `microsoft.mailbox` SHALL bind these same Profile contracts; provider-specific Action ids or input shapes MUST NOT be introduced.

#### Scenario: Gmail Draft is created at the provider
- **WHEN** valid create input is run through an explicit Google mailbox Source
- **THEN** the Adapter persists a Gmail Draft and returns its normalized `communication.message` Resource and stable Ref

#### Scenario: Outlook Draft is created at the provider
- **WHEN** valid create input is run through an explicit Microsoft mailbox Source
- **THEN** the Adapter persists an Outlook Draft and returns its normalized `communication.message` Resource and stable immutable-id Ref

#### Scenario: Existing Draft is updated at the provider
- **WHEN** valid update input identifies an existing Google or Microsoft provider Draft through its explicit Source
- **THEN** the owning Adapter updates that Draft once and returns the resulting normalized Resource under the same Ref

### Requirement: Consequential mutations remain deferred
For V1, the system MUST NOT implement email sending, calendar mutations, other irreversible provider mutations, arbitrary Extension commands, or agent workflow policy. Email Grants and Adapters MUST NOT request a send-only permission, bind a send Action, or call a send endpoint. Text composed only in an agent conversation MUST NOT be represented as a Draft until a Draft Action persists it at the provider.

#### Scenario: Sending is unavailable
- **WHEN** a caller inspects or invokes available Actions across Google and Microsoft Sources
- **THEN** no email-send or other irreversible provider Action is available

#### Scenario: Send permission is absent
- **WHEN** exact granted scopes and provider request logs are inspected
- **THEN** neither Google send-only scope nor Microsoft `Mail.Send` is present and no send route was requested

#### Scenario: Conversation text is not provider state
- **WHEN** an agent composes message text without running a Draft Action
- **THEN** ctxindex creates no Draft Resource or provider mutation

### Requirement: Provider-independent typed Actions
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Profiles MAY declare typed Actions. Each Action MUST have a stable id, input schema, output contract, effect classification (`reversible` or `irreversible`), and documentation. Action declarations MUST remain provider-independent; Source Adapters bind provider implementations to the Profile Action ids they support.

`action describe <action-id>` MUST derive its input and availability from the loaded registries. `action run <action-id>` MUST require an explicit Source, validate the complete input before provider I/O, execute only when that Source's Adapter implements the Action, and return the declared normalized result with Resource Refs where applicable.

An Action result that creates or changes addressable provider context SHOULD be returned as a Resource and MAY be materialized locally as an `adhoc` row. External services remain canonical. Agent reasoning, content composition, approval conversations, and multi-step workflow policy remain outside ctxindex.

An irreversible Action MUST require an explicit non-interactive confirmation signal and MUST NOT be automatically retried after an ambiguous provider outcome. Milestone documents MAY ship only reversible Actions.

A provider-persisted email Draft is a `communication.message` Resource produced by a reversible Action. Text composed only in an agent conversation is not a provider Draft and requires no ctxindex operation.

When a milestone ships Draft Actions without sending, its Adapters MUST NOT bind a send Action, call a send endpoint, or request a send-only permission. A broader provider permission that is the narrowest available permission capable of Draft persistence MUST be paired with registry, request, and acceptance checks proving no send capability.

#### Scenario: An Action validates input and executes only through an explicit supporting Source
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
