# Retrieval And Artifacts Specification

## Purpose
Define complete Resource and thread retrieval plus managed Artifact retention, download, and Profile-declared export behavior.
## Requirements
### Requirement: Complete Resource retrieval by Ref
For V1, `get <ref>` SHALL return a complete Resource from local materialization when available and otherwise invoke the owning Source Adapter's `retrieve` capability. Provider-retrieved Resources MUST retain the requested Ref and SHALL be cached as purgeable `adhoc` materializations.

#### Scenario: Locally materialized Resource is returned
- **WHEN** `get` receives a Ref whose complete Resource is stored locally
- **THEN** the command returns that Resource without provider retrieval

#### Scenario: Missing local Resource is hydrated
- **WHEN** `get` receives a valid Ref absent from local storage and the Source supports retrieval
- **THEN** the Adapter retrieves the complete Resource and core returns and caches it as `adhoc`

### Requirement: Thread retrieval uses generic Relations
For V1, `thread <ref>` SHALL return the union of provider conversation membership and bidirectional `parent` Relation traversal. It MUST present a tree when parent edges exist and otherwise a flat date-ordered list.

#### Scenario: Reply tree is assembled across arrival order
- **WHEN** related Gmail messages have conversation membership and parent Relations that were stored in any order
- **THEN** `thread` returns their complete union as a reply tree

#### Scenario: Conversation without parent edges is ordered
- **WHEN** conversation members have no resolvable parent Relations
- **THEN** `thread` returns a flat list ordered by date

### Requirement: Managed Artifact lifecycle
For V1, Artifact bytes SHALL use a content-addressed managed store with media type, size, origin Ref, and retention metadata. Download MUST use cached bytes when present and otherwise the Adapter's `download` capability; `--output` MUST copy bytes without transferring store ownership. Sync MUST NOT fetch all Artifact bytes by default, and the store SHALL support explicit purge and disk accounting.

#### Scenario: Uncached Artifact is downloaded and copied
- **WHEN** a caller downloads an uncached Artifact to an output path
- **THEN** the Adapter streams the bytes into the managed store and core copies them to the requested path

#### Scenario: Cached Artifact avoids provider download
- **WHEN** a caller downloads an Artifact whose bytes already exist in the managed store
- **THEN** core serves the stored bytes without provider I/O

### Requirement: V1 Artifact retention is explicit cached state
For V1, every materialized Artifact byte object SHALL use the retention class `cached`. Cached bytes MUST be fetched only on demand, retained indefinitely, and removed only by explicit `ctxindex artifact purge`. V1 MUST NOT automatically evict Artifact bytes by age, quota, or storage pressure. Purge MUST remove managed bytes and cache metadata without removing the owning Resource or its Profile-derived Artifact descriptor, so a later download can fetch the bytes again.

#### Scenario: Lazy download remains cached
- **WHEN** an uncached Artifact is downloaded successfully
- **THEN** its bytes are stored with retention class `cached` and remain available for cache reuse until explicit purge

#### Scenario: Explicit purge preserves rediscovery
- **WHEN** the caller runs `ctxindex artifact purge`
- **THEN** managed Artifact bytes and cache metadata are removed while owning Resources and their Artifact descriptors remain available for a later re-download

### Requirement: Profile-declared export
For V1, `export <ref> --format <f>` SHALL resolve formats from the Resource Profile's export map and stream its rendered representation. Core MUST NOT maintain domain-specific conversion pipelines, and validated payload JSON MUST always be exportable without a Profile declaration.

#### Scenario: Declared export format is rendered
- **WHEN** a caller requests a format declared by the Resource's Profile
- **THEN** core invokes that Profile renderer and streams the declared media representation

#### Scenario: JSON fallback is available
- **WHEN** a Resource Profile declares no export formats
- **THEN** the caller can still export the validated payload as JSON

### Requirement: Microsoft mailbox retrieval has provider-neutral parity
For V1, `microsoft.mailbox` Resources SHALL use the existing complete Resource retrieval, generic conversation Relations, managed Artifact, cache, and Profile export contracts without Microsoft-specific core or CLI paths. Provider immutable ids MUST keep message, Draft, and attachment addressing stable within the Source.

#### Scenario: Missing Outlook message is hydrated
- **WHEN** `get` receives a valid Microsoft message Ref absent from local storage
- **THEN** the owning Adapter retrieves and caches a complete `mail.message` Resource through the generic path

#### Scenario: Outlook thread uses Relations
- **WHEN** a caller runs `thread` for related Microsoft messages
- **THEN** generic Relation traversal returns their deterministic union without a provider-specific thread command

#### Scenario: Outlook attachment uses the managed cache
- **WHEN** a caller downloads an Outlook file attachment twice
- **THEN** the first request stores exact provider bytes in the managed Artifact store and the second performs no provider download

#### Scenario: Outlook message exports through its Profile
- **WHEN** a caller exports a normalized Outlook message as EML or JSON
- **THEN** the existing mail Profile renderer/fallback streams the representation without Microsoft conversion code in core

### Requirement: Attachment materialization
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Mail and calendar attachments SHOULD become separate resources when their content is extractable, linked to the parent resource by relations. Non-extractable attachments remain artifact descriptors on the parent resource.

#### Scenario: Extractable and non-extractable attachments use the correct representation
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Retrieval, Artifact, and export contract
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Retrieval: `get <ref>` MUST return the complete resource, serving from local rows when present and invoking the adapter's `retrieve` capability otherwise. Retrieved resources are cached as `adhoc` rows ([generic storage](../generic-storage/spec.md)).

Thread retrieval: `thread <ref>` MUST return the union of provider conversation membership and the reply-tree walk over `parent` relations in both directions, presenting a tree when parent edges exist and a flat, date-ordered list otherwise.

Artifacts: artifact bytes MUST live in a content-addressed store with recorded media type, size, origin ref, and retention class. Downloads MUST be served from the store when present (cache) and via the adapter's `download` capability otherwise. `--output` copies bytes to a caller path; the store remains the system of record. Artifact retention during sync is policy-driven and MUST NOT default to fetching all bytes. The store MUST support purge and disk accounting.

Export: `export <ref> --format <f>` resolves the resource's profile, looks up `f` in its export map, and streams the rendered representation. Valid formats per kind are exactly the profile-declared export map keys. Core MUST NOT implement format conversion pipelines; a JSON export of the validated payload is always available without profile declaration.

Search results, Source descriptions, and describe output SHOULD carry machine-readable affordances (available operations and Actions derived from capability flags, Profile vocabulary, and Adapter bindings) so callers never need provider-specific knowledge.

#### Scenario: Retrieval and Artifact operations follow Source capabilities and Profile formats
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Complete locally actionable message threading data
Complete `mail.message@1` Resources emitted by Gmail and Microsoft mailbox retrieval SHALL retain the portable Reply-To addresses, RFC References, message identity, and provider conversation or thread identity available from the provider and required for reply Draft construction. Retrieval MUST preserve the Resource's stable Source-scoped Ref.

#### Scenario: Retrieved parent becomes eligible for reply validation
- **WHEN** a provider message supplies the recipient and threading fields required by its mailbox Adapter
- **THEN** complete retrieval materializes those fields locally so a later reply Action needs no provider read before mutation

#### Scenario: Provider omits required reply data
- **WHEN** a complete provider response lacks fields required to construct a native reply safely
- **THEN** the Resource remains retrievable but a later reply Action fails locally with actionable guidance rather than guessing or fetching during the Action

### Requirement: Mailbox retrieval and Artifact contracts have deterministic cross-provider replay evidence
Automated acceptance evidence SHALL apply one shared on-demand retrieval and Artifact lifecycle to `google.mailbox` and `microsoft.mailbox` using only obviously invented provider-shaped fixtures under reserved `.test` domains and loopback provider mocks. Every phase SHALL execute in a fresh compiled CLI process against one provider-local isolated state directory.

The evidence SHALL verify a stable remote-search Ref; complete ad-hoc hydration with body, conversation and reply identities, and one safe file Artifact descriptor; byte-identical locally served retrieval without provider reads; exact first-download bytes and later output copies from the managed cache; explicit Artifact purge that preserves the owning Resource and descriptor followed by one exact provider re-fetch; deterministic EML and JSON exports without provider reads; and rejection of malformed or foreign message and Artifact Refs before provider I/O. Provider-specific replay code SHALL be limited to invented response setup, exact credential-free route inspection, and request counts.

#### Scenario: Both mailbox providers complete the shared retrieval and Artifact lifecycle
- **WHEN** the automated replay runs the shared lifecycle for Google and Microsoft mailbox Sources
- **THEN** each provider satisfies the same stable Ref, complete ad-hoc Resource, Relation identity, Artifact descriptor, exact byte, cache, purge, re-fetch, and export assertions without live authentication or provider data

#### Scenario: Invalid mailbox identities stop before provider I/O
- **WHEN** the replay supplies malformed or foreign message and Artifact Refs for either mailbox Source
- **THEN** each command fails through the existing validation and exit contracts before any provider request occurs

### Requirement: Managed Artifact bytes are Action inputs only after verified caching
A Profile-derived Artifact SHALL become eligible as a Draft attachment input only after its bytes have been materialized in the managed content-addressed store. Eligibility MUST require the descriptor to remain derivable from its complete, non-deleted origin Resource, its Ref and origin to belong to the selected Source, and its cached bytes, size, media type, and content hash to pass existing integrity checks. Action resolution MUST NOT download, copy from an arbitrary path, or otherwise acquire missing bytes.

#### Scenario: Downloaded Artifact becomes eligible
- **WHEN** `artifact download` has cached exact bytes for a valid same-Source descriptor
- **THEN** a later Draft create may consume those verified bytes without provider read access

#### Scenario: Purged Artifact is unavailable to an Action
- **WHEN** a descriptor remains but its cached bytes were purged
- **THEN** Draft attachment validation fails with download guidance before provider mutation

#### Scenario: Descriptor drift invalidates cached input
- **WHEN** a cached Artifact Ref is no longer emitted by its origin Resource's current Profile payload
- **THEN** the Action rejects it even if orphaned cache metadata or bytes remain
