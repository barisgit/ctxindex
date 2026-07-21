## MODIFIED Requirements

### Requirement: V1 email Draft Actions
For V1, the system SHALL implement exactly the reversible provider-persisted email Actions `mail.message.draft.create` and `mail.message.draft.update`. Each Action MUST require an explicit mailbox Source, persist the Draft through that Source and authentication boundary, and return the resulting normalized `mail.message` Resource Ref. Both `google.mailbox` and `microsoft.mailbox` SHALL bind these same Profile contracts; provider-specific or legacy `communication.message` Action ids or input shapes MUST NOT be introduced.

#### Scenario: Gmail Draft is created at the provider
- **WHEN** valid create input is run through an explicit Google mailbox Source
- **THEN** the Adapter persists a Gmail Draft and returns its normalized `mail.message` Resource and stable Ref

#### Scenario: Outlook Draft is created at the provider
- **WHEN** valid create input is run through an explicit Microsoft mailbox Source
- **THEN** the Adapter persists an Outlook Draft and returns its normalized `mail.message` Resource and stable immutable-id Ref

#### Scenario: Existing Draft is updated at the provider
- **WHEN** valid update input identifies an existing Google or Microsoft provider Draft through its explicit Source
- **THEN** the owning Adapter updates that Draft once and returns the resulting normalized Resource under the same Ref

### Requirement: Provider-independent typed Actions
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Profiles MAY declare typed Actions. Each Action MUST have a stable id, input schema, output contract, effect classification (`reversible` or `irreversible`), and documentation. Action declarations MUST remain provider-independent; Source Adapters bind provider implementations to the Profile Action ids they support.

`action describe <action-id>` MUST derive its input and availability from the loaded registries. `action run <action-id>` MUST require an explicit Source, validate the complete input before provider I/O, execute only when that Source's Adapter implements the Action, and return the declared normalized result with Resource Refs where applicable.

An Action result that creates or changes addressable provider context SHOULD be returned as a Resource and MAY be materialized locally as an `adhoc` row. External services remain canonical. Agent reasoning, content composition, approval conversations, and multi-step workflow policy remain outside ctxindex.

An irreversible Action MUST require an explicit non-interactive confirmation signal and MUST NOT be automatically retried after an ambiguous provider outcome. Milestone documents MAY ship only reversible Actions.

A provider-persisted email Draft is a `mail.message` Resource produced by a reversible Action. Text composed only in an agent conversation is not a provider Draft and requires no ctxindex operation.

When a milestone ships Draft Actions without sending, its Adapters MUST NOT bind a send Action, call a send endpoint, or request a send-only permission. A broader provider permission that is the narrowest available permission capable of Draft persistence MUST be paired with registry, request, and acceptance checks proving no send capability.

#### Scenario: An Action validates input and executes only through an explicit supporting Source
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
