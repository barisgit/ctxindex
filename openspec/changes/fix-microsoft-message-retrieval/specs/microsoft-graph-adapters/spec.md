## MODIFIED Requirements

### Requirement: Microsoft mailbox provides normalized read access
`microsoft.mailbox@1` SHALL implement federated discovery, complete retrieval, conversation Relations, attachment descriptors/download, and existing Profile exports through `communication.message@1`. Every Graph message request — including every page fetch of a remote search, initial page and `@odata.nextLink` continuations alike — SHALL explicitly opt into provider immutable ids via `Prefer: IdType="ImmutableId"`, every Ref SHALL be canonical and Source-scoped, and provider paging/errors SHALL map to existing normalized result/warning/error contracts. A Ref emitted by remote search MUST remain valid for exact retrieval and complete ad-hoc materialization. Microsoft Graph failures MUST preserve the normalized error taxonomy while exposing only a validated provider error code, fixed sanitized technical wording when recognized, and redacted indication of provider request-identifier presence; arbitrary provider wording, raw response bodies, and request-identifier values MUST NOT be disclosed. Draft create/update requests SHALL carry the same immutable-id preference so returned Draft Refs are immutable-id based.

#### Scenario: Outlook discovery returns messages
- **WHEN** an eligible Microsoft mailbox Source receives a generic remote search
- **THEN** Graph results are normalized into communication message Resources with stable immutable-id Refs and common search envelopes

#### Scenario: Fresh discovery Ref is retrieved
- **WHEN** exact retrieval receives a canonical Ref emitted by a completed remote Microsoft mailbox search
- **THEN** the corresponding complete message is materialized through the generic retrieval path using the same immutable provider identity

#### Scenario: Message moves folders
- **WHEN** a provider message moves within the same mailbox
- **THEN** retrieval and subsequent discovery retain its existing immutable-id Resource Ref

#### Scenario: Multi-page search proves the immutable-id preference
- **WHEN** a remote search paginates through an initial page and one or more `@odata.nextLink` pages
- **THEN** every page request provably includes the `Prefer: IdType="ImmutableId"` header

#### Scenario: Conversation is traversed
- **WHEN** multiple Outlook messages share provider conversation identity and reply metadata
- **THEN** Profile Relations allow generic `thread get` to return their deterministic union

#### Scenario: Graph failure includes safe diagnostics
- **WHEN** Graph returns a structured failure containing a provider code, message, and request identifiers
- **THEN** ctxindex keeps the existing normalized error/exit classification and reports the validated code, recognized fixed technical wording, and redacted identifier presence without reporting raw provider wording, bodies, or identifier values

### Requirement: Outlook attachments use managed Artifacts
Microsoft file attachment metadata SHALL become Profile-derived Artifact descriptors without eagerly storing bytes. Metadata hydration MUST traverse every validated attachment page within the safety bound using Graph-compatible selection semantics, and MUST collect safe file identity/name/media-type fields plus provider type annotations without selecting an annotation as an OData property. Because Exchange attachment `size` is an approximate aggregate rather than a reliable raw-content length, retrieval MUST NOT publish it as exact `Artifact.byteSize`; the managed store SHALL derive exact size from streamed bytes. Download SHALL use the canonical message/attachment identity through the linked Grant, stream exact bytes into the managed content-addressed store, and reuse cached bytes on later requests. Unsupported non-file attachment kinds SHALL be represented safely or warned without corrupting the parent Resource.

#### Scenario: Paged attachment metadata is hydrated
- **WHEN** exact message retrieval reports attachments across an initial metadata page and one or more validated continuation pages
- **THEN** every page succeeds with immutable-id preference and all supported file descriptors become available through generic `artifact list`

#### Scenario: Unsupported annotation selection is rejected by replay
- **WHEN** the synthetic Graph replay receives an attachment metadata select/expand expression that names `@odata.type` as a property
- **THEN** it returns the same sanitized `BadRequest` class observed at the live-provider boundary and the workflow test fails before Artifact listing

#### Scenario: File attachment is downloaded once
- **WHEN** an uncached Outlook file Artifact is requested
- **THEN** exactly one Graph download supplies bytes to the managed store and a second request uses the cache

#### Scenario: Graph reports an approximate attachment size
- **WHEN** Graph attachment metadata reports a size that differs from the raw `$value` byte count
- **THEN** the descriptor omits an exact pre-download `byteSize`, download accepts the valid raw bytes, and the managed store records their actual count

#### Scenario: Malformed attachment Ref is supplied
- **WHEN** an Artifact identity does not canonically belong to the Source/message
- **THEN** download fails before auth or provider I/O
