## ADDED Requirements

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
