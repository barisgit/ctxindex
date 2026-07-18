## ADDED Requirements

### Requirement: Complete locally actionable message threading data
Complete `communication.message@1` Resources emitted by Gmail and Microsoft mailbox retrieval SHALL retain the portable Reply-To addresses, RFC References, message identity, and provider conversation or thread identity available from the provider and required for reply Draft construction. Retrieval MUST preserve the Resource's stable Source-scoped Ref.

#### Scenario: Retrieved parent becomes eligible for reply validation
- **WHEN** a provider message supplies the recipient and threading fields required by its mailbox Adapter
- **THEN** complete retrieval materializes those fields locally so a later reply Action needs no provider read before mutation

#### Scenario: Provider omits required reply data
- **WHEN** a complete provider response lacks fields required to construct a native reply safely
- **THEN** the Resource remains retrievable but a later reply Action fails locally with actionable guidance rather than guessing or fetching during the Action
