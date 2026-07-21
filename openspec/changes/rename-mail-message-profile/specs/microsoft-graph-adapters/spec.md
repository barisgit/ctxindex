## MODIFIED Requirements

### Requirement: Microsoft mailbox provides normalized read access
`microsoft.mailbox` SHALL implement federated discovery, complete retrieval, conversation Relations, attachment descriptors/download, and existing Profile exports through `mail.message@1`. Every Graph message request — including every page fetch of a remote search, initial page and `@odata.nextLink` continuations alike — SHALL explicitly opt into provider immutable ids via `Prefer: IdType="ImmutableId"`, every Ref SHALL be canonical and Source-scoped, and provider paging/errors SHALL map to existing normalized result/warning/error contracts. Draft create/update requests SHALL carry the same immutable-id preference so returned Draft Refs are immutable-id based.

#### Scenario: Outlook discovery returns messages
- **WHEN** an eligible Microsoft mailbox Source receives a generic remote search
- **THEN** Graph results are normalized into mail message Resources with stable immutable-id Refs and common search envelopes

#### Scenario: Message moves folders
- **WHEN** a provider message moves within the same mailbox
- **THEN** retrieval and subsequent discovery retain its existing immutable-id Resource Ref

#### Scenario: Multi-page search proves the immutable-id preference
- **WHEN** a remote search paginates through an initial page and one or more `@odata.nextLink` pages
- **THEN** every page request provably includes the `Prefer: IdType="ImmutableId"` header

#### Scenario: Conversation is traversed
- **WHEN** multiple Outlook messages share provider conversation identity and reply metadata
- **THEN** Profile Relations allow generic `thread` retrieval to return their deterministic union

### Requirement: Outlook implements reversible Draft Actions
`microsoft.mailbox` SHALL bind exactly `mail.message.draft.create` and `mail.message.draft.update` using delegated `Mail.ReadWrite` and MUST NOT request `Mail.Send`. Create SHALL perform exactly one provider Draft-create mutation and return a stable immutable-id Draft Ref. Update SHALL validate a canonical same-Source Draft Ref and complete replacement recipients/subject/text before exactly one provider update mutation, returning the same Ref. Core and Adapter mutation paths MUST NOT retry either operation automatically.

#### Scenario: Outlook Draft is created
- **WHEN** valid Draft input is run through an explicit Microsoft mailbox Source
- **THEN** one Graph Draft-create request persists it and returns a complete normalized Draft Resource

#### Scenario: Outlook Draft is replaced
- **WHEN** complete updated input addresses that Draft Ref
- **THEN** one Graph update request changes recipients, subject, and text while preserving the Ref

#### Scenario: Send-like Action is attempted
- **WHEN** an agent describes or invokes a send-like Action id
- **THEN** no such Action or binding exists and no Graph send route is called
