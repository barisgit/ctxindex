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
For V1, the system SHALL implement exactly the reversible provider-persisted email Actions `mail.message.draft.create` and `mail.message.draft.update`. Each Action MUST require an explicit mailbox Source, persist the Draft through that Source and authentication boundary, and return the resulting normalized `mail.message` Resource Ref. Both `google.mailbox` and `microsoft.mailbox` SHALL bind these same Profile contracts; provider-specific Action ids or input shapes MUST NOT be introduced.

#### Scenario: Gmail Draft is created at the provider
- **WHEN** valid create input is run through an explicit Google mailbox Source
- **THEN** the Adapter persists a Gmail Draft and returns its normalized `mail.message` Resource and stable Ref

#### Scenario: Outlook Draft is created at the provider
- **WHEN** valid create input is run through an explicit Microsoft mailbox Source
- **THEN** the Adapter persists an Outlook Draft and returns its normalized `mail.message` Resource and stable immutable-id Ref

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

A provider-persisted email Draft is a `mail.message` Resource produced by a reversible Action. Text composed only in an agent conversation is not a provider Draft and requires no ctxindex operation.

When a milestone ships Draft Actions without sending, its Adapters MUST NOT bind a send Action, call a send endpoint, or request a send-only permission. A broader provider permission that is the narrowest available permission capable of Draft persistence MUST be paired with registry, request, and acceptance checks proving no send capability.

#### Scenario: An Action validates input and executes only through an explicit supporting Source
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Source-scoped local Resource resolution for Actions
Core SHALL provide Action adapters a generic local Resource resolver scoped to the selected Source. Resolution MUST accept only an exact Ref owned by that Source, MUST expose completeness and deletion state needed for validation, and MUST perform no authentication or provider I/O. Core MUST remain unaware of email profiles or reply semantics.

#### Scenario: Cross-Source Ref is rejected locally
- **WHEN** an Action attempts to resolve a Ref owned by a different Source
- **THEN** resolution fails before authentication, token refresh, Adapter fetch, or provider mutation

#### Scenario: Missing local Resource is not hydrated
- **WHEN** an Action attempts to resolve a Ref that is not locally materialized
- **THEN** resolution fails with actionable retrieval guidance and performs no provider I/O

### Requirement: Portable threaded reply Draft Actions
The existing Draft create and update Actions SHALL support provider-native reply branches. Before authentication or provider I/O, reply create MUST resolve `replyToRef` to a complete, non-deleted, non-Draft `mail.message@1` Resource in the exact selected Source. Reply update MUST additionally resolve the addressed complete Draft in that Source and prove its stored `replyToRef` exactly matches the requested parent.

The reply recipient MUST be the first Reply-To address when present and otherwise the first From address. Reply-all MUST NOT be performed. The subject MUST be derived deterministically from the parent and MUST NOT be caller-overridable. Missing locally required recipient, identity, reference-chain, conversation, or provider-thread data MUST fail with guidance to retrieve the message first.

A locally stored reply Draft MUST NOT be updated through the standalone branch. Update validation MUST preserve its stored reply context even when the caller omits `replyToRef`.

Each valid create or update MUST perform exactly one reversible provider mutation with no automatic retry, return a complete reply Draft Resource under a stable Ref, and preserve immutable `replyToRef`. No send Action, send endpoint, or send-only permission may be added.

#### Scenario: Valid local parent creates one reply Draft
- **WHEN** valid reply create input identifies a complete eligible parent in the selected Source
- **THEN** the Adapter performs one native Draft mutation and returns a complete Draft with derived recipient, subject, and immutable `replyToRef`

#### Scenario: Ineligible parent causes zero I/O
- **WHEN** `replyToRef` is missing, cross-Source, incomplete, deleted, already a Draft, or lacks required local threading fields
- **THEN** the Action fails before authentication or provider I/O with actionable retrieval guidance where hydration could resolve the problem

#### Scenario: Reply parent cannot change on update
- **WHEN** reply update supplies a `replyToRef` different from the locally stored Draft parent
- **THEN** the Action fails before provider I/O and leaves the Draft unchanged

#### Scenario: Standalone update cannot erase reply context
- **WHEN** standalone update addresses a locally stored reply Draft without its `replyToRef`
- **THEN** the Action fails before provider I/O and leaves the Draft unchanged

#### Scenario: Reply overrides are unavailable
- **WHEN** a caller attempts to supply recipients, subject, cc, or bcc for a reply
- **THEN** input validation fails and no provider I/O occurs

### Requirement: Source-scoped managed Artifact resolution for Actions
Core SHALL provide Action adapters a read-only asynchronous managed Artifact resolver scoped to the selected Source. Resolution MUST accept only an exact Ref owned by that Source, prove that the Ref is a current Profile-derived descriptor, verify its cached content-addressed bytes and metadata, and return only safe descriptor metadata plus exact bytes. It MUST perform no authentication or provider I/O.

Malformed, foreign-Source, unavailable, duplicate, descriptor-mismatched, integrity-invalid, or unsafe attachment inputs MUST fail before provider mutation. Missing cached bytes MUST fail with actionable `artifact download` guidance rather than being downloaded during the Action.

#### Scenario: Cached managed Artifact resolves before provider access
- **WHEN** a create input names a same-Source Profile-derived Artifact whose cached bytes pass integrity verification
- **THEN** the Adapter receives its exact bytes and validated metadata without authentication or network access

#### Scenario: Foreign or unavailable Artifact is rejected locally
- **WHEN** an attachment Ref belongs to another Source, is not a current descriptor, lacks cached bytes, or fails integrity verification
- **THEN** the Action fails before token resolution or provider mutation and no Draft is created

### Requirement: One-shot Draft creation with managed attachments
Both standalone and threaded-reply Draft create branches SHALL persist every validated managed attachment through exactly one reversible, no-retry provider mutation on Gmail and Microsoft Sources. The returned complete Draft Resource MUST retain the stable Draft Ref, selected attachment provenance, and any immutable reply context. No create path may call a send route.

#### Scenario: Standalone Draft creates all selected attachments
- **WHEN** valid standalone input selects one or more available managed Artifacts
- **THEN** exactly one provider mutation creates a Draft containing their exact bytes and returns complete ordered managed provenance

#### Scenario: Reply Draft creates attachments in its native thread
- **WHEN** valid reply input selects one or more available managed Artifacts and an eligible local parent
- **THEN** exactly one native reply-Draft mutation preserves thread identity and contains every selected attachment

### Requirement: Draft updates preserve attachments
Draft update SHALL NOT add, remove, clear, replace, or reorder attachments. The Action MUST preserve the provider Draft's attachment collection while replacing only the existing portable content and retaining immutable reply context. When the selected provider requires full-message replacement, the Action MUST prove the complete managed attachment set locally and re-emit every verified byte in the same mutation; missing provenance or unavailable bytes MUST fail before provider mutation. Providers that preserve omitted attachment properties MUST omit them from the update request.

#### Scenario: Gmail update replays a proven attachment set
- **WHEN** a Gmail Draft has complete local managed attachment provenance and every referenced byte remains available
- **THEN** one Draft replacement re-emits the exact attachment set with the replacement content

#### Scenario: Update cannot prove preservation
- **WHEN** a full-message replacement cannot prove the Draft's complete attachment set or resolve every required byte
- **THEN** the Action fails before provider I/O and leaves the Draft unchanged

#### Scenario: Microsoft update preserves by omission
- **WHEN** valid replacement content addresses a Microsoft Draft with any existing attachments
- **THEN** one PATCH omits the attachment collection and preserves it unchanged
