## MODIFIED Requirements

### Requirement: V1 email Draft Actions
The system SHALL implement exactly the reversible provider-persisted email Actions `communication.message.draft.create` and `communication.message.draft.update`. Each Action MUST require an explicit mailbox Source, persist the Draft through that Source and authentication boundary, and return the resulting normalized `communication.message` Resource Ref. Both `google.mailbox` and `microsoft.mailbox` SHALL bind these same Profile contracts; provider-specific Action ids or input shapes MUST NOT be introduced.

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
The system MUST NOT implement email sending, calendar mutations, other irreversible provider mutations, arbitrary Extension commands, or agent workflow policy. Email Grants and Adapters MUST NOT request a send-only permission, bind a send Action, or call a send endpoint. Text composed only in an agent conversation MUST NOT be represented as a Draft until a Draft Action persists it at the provider.

#### Scenario: Sending is unavailable
- **WHEN** a caller inspects or invokes available Actions across Google and Microsoft Sources
- **THEN** no email-send or other irreversible provider Action is available

#### Scenario: Send permission is absent
- **WHEN** exact granted scopes and provider request logs are inspected
- **THEN** neither Google send-only scope nor Microsoft `Mail.Send` is present and no send route was requested

#### Scenario: Conversation text is not provider state
- **WHEN** an agent composes message text without running a Draft Action
- **THEN** ctxindex creates no Draft Resource or provider mutation
