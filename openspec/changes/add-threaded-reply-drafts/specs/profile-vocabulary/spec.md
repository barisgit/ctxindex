## ADDED Requirements

### Requirement: Portable threaded reply Draft vocabulary
`mail.message@1` SHALL expose optional ordered Reply-To addresses and RFC References needed to construct portable replies, and reply Draft Resources SHALL expose the immutable same-Source parent Ref as `replyToRef`. Existing message payloads and standalone Draft payloads without these optional fields MUST remain valid.

Draft create and update Action inputs MUST be strict unions. The existing standalone create and update branches MUST remain unchanged. Reply create MUST accept exactly `replyToRef` and `bodyText`; reply update MUST accept exactly `ref`, `replyToRef`, and `bodyText`. A reply branch MUST reject recipient, subject, cc, bcc, attachment, provider-id, or other override fields.

#### Scenario: Strict reply create input
- **WHEN** a caller supplies `replyToRef` and `bodyText` without standalone fields
- **THEN** the create input validates as a reply branch

#### Scenario: Mixed reply input is rejected
- **WHEN** a caller combines `replyToRef` with recipient, subject, cc, bcc, provider identifiers, or unknown properties
- **THEN** schema validation fails before Adapter execution

#### Scenario: Existing standalone input remains valid
- **WHEN** a caller supplies an input accepted by the existing standalone Draft branch
- **THEN** the unchanged standalone branch continues to validate

#### Scenario: Reply Draft retains parent identity
- **WHEN** a reply Draft Action returns a normalized Resource
- **THEN** its payload contains the exact immutable same-Source `replyToRef`
