## ADDED Requirements

### Requirement: Source-scoped local Resource resolution for Actions
Core SHALL provide Action adapters a generic local Resource resolver scoped to the selected Source. Resolution MUST accept only an exact Ref owned by that Source, MUST expose completeness and deletion state needed for validation, and MUST perform no authentication or provider I/O. Core MUST remain unaware of email profiles or reply semantics.

#### Scenario: Cross-Source Ref is rejected locally
- **WHEN** an Action attempts to resolve a Ref owned by a different Source
- **THEN** resolution fails before authentication, token refresh, Adapter fetch, or provider mutation

#### Scenario: Missing local Resource is not hydrated
- **WHEN** an Action attempts to resolve a Ref that is not locally materialized
- **THEN** resolution fails with actionable retrieval guidance and performs no provider I/O

### Requirement: Portable threaded reply Draft Actions
The existing Draft create and update Actions SHALL support provider-native reply branches. Before authentication or provider I/O, reply create MUST resolve `replyToRef` to a complete, non-deleted, non-Draft `communication.message@1` Resource in the exact selected Source. Reply update MUST additionally resolve the addressed complete Draft in that Source and prove its stored `replyToRef` exactly matches the requested parent.

The reply recipient MUST be the first Reply-To address when present and otherwise the first From address. Reply-all MUST NOT be performed. The subject MUST be derived deterministically from the parent and MUST NOT be caller-overridable. Missing locally required recipient, identity, reference-chain, conversation, or provider-thread data MUST fail with guidance to retrieve the message first.

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

#### Scenario: Reply overrides are unavailable
- **WHEN** a caller attempts to supply recipients, subject, cc, or bcc for a reply
- **THEN** input validation fails and no provider I/O occurs
