## MODIFIED Requirements

### Requirement: Microsoft mailbox provides normalized read access
`microsoft.mailbox@1` SHALL implement federated discovery, constrained query-less enumeration, complete retrieval, conversation Relations, attachment descriptors/download, and existing Profile exports through `communication.message@1`. It SHALL translate Profile `unread=true` to exact provider `IsRead:false` semantics and `unread=false` to exact provider `IsRead:true` semantics, then return payloads that allow the provider-neutral Profile extractor to verify the same boolean before caching or output. Remote discovery SHALL exclude Drafts, deduplicate immutable message ids within and across resumed pages, return at most 50 normalized messages per invocation, and expose a query-bound opaque continuation whenever a validated Graph next page remains. Every Graph message request — including every page fetch of a remote search, initial page and `@odata.nextLink` continuations alike — SHALL explicitly opt into provider immutable ids via `Prefer: IdType="ImmutableId"`, every Ref SHALL be canonical and Source-scoped, and provider paging/errors SHALL map to existing normalized result/warning/error contracts. Draft create/update requests SHALL carry the same immutable-id preference so returned Draft Refs are immutable-id based.

#### Scenario: Outlook discovery returns messages
- **WHEN** an eligible Microsoft mailbox Source receives a generic text or constrained query-less remote search
- **THEN** Graph results are normalized into communication message Resources with stable immutable-id Refs and common search envelopes

#### Scenario: Exact unread booleans are translated and verified
- **WHEN** remote discovery receives `unread=true` or `unread=false`
- **THEN** Microsoft receives respectively `IsRead:false` or `IsRead:true`, and every returned message payload verifies that exact Profile boolean

#### Scenario: Message moves folders
- **WHEN** a provider message moves within the same mailbox
- **THEN** retrieval and subsequent discovery retain its existing immutable-id Resource Ref

#### Scenario: Multi-page search proves immutable resumability
- **WHEN** a remote search reaches its 50-message or page bound with a validated `@odata.nextLink`
- **THEN** it returns an opaque query-bound continuation and every initial or resumed page request includes `Prefer: IdType="ImmutableId"`

#### Scenario: Resumed page has no duplicates or Drafts
- **WHEN** Graph repeats an immutable id across a continuation boundary or returns a Draft candidate
- **THEN** the resumed result omits that duplicate or Draft without discarding distinct eligible messages and reports further continuation when provider data remains

#### Scenario: Conversation is traversed
- **WHEN** multiple Outlook messages share provider conversation identity and reply metadata
- **THEN** Profile Relations allow generic `thread get` to return their deterministic union
