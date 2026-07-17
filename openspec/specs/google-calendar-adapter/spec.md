# Google Calendar Adapter Specification

## Purpose
Define Google Calendar Source selection, authorization, synchronization, normalization, and retrieval through generic calendar contracts.
## Requirements
### Requirement: Google Calendar Source selects one collection explicitly
`google.calendar@1` SHALL be a bundled indexed Source Adapter for `calendar.event@1`. Its registry-derived configuration SHALL identify exactly one Google calendar, defaulting only to the provider's documented primary calendar identifier, and explicit positive past/future coverage days. One Source SHALL maintain one independent anchored window, cursor, manifest, and Resource namespace for that calendar.

#### Scenario: Primary calendar Source is created
- **WHEN** a compatible Google Grant and no explicit calendar id are supplied
- **THEN** Source configuration records the documented primary selection and binds exactly that Grant and Realm

#### Scenario: Named calendar Source is created
- **WHEN** a caller supplies an explicit calendar id
- **THEN** only that provider calendar is synchronized through the Source

### Requirement: Google Calendar sync is incremental and deterministic
Initial sync SHALL traverse all provider pages for the selected calendar using one consistent event-shaping policy, emit normalized Resources/tombstones in deterministic order, and persist the final sync token only after generic storage commits. Later sync SHALL use the stored token, include provider deletions, and handle provider-declared token invalidation by warning and performing a bounded full reconciliation that can tombstone missing prior Resources without guessing after an uncertain scan.

#### Scenario: Initial multi-page sync succeeds
- **WHEN** Google returns multiple event pages and a final next-sync token
- **THEN** every valid event is materialized once and the final token advances only with the committed run

#### Scenario: Incremental deletion arrives
- **WHEN** a subsequent sync page identifies a deleted/cancelled provider event
- **THEN** the matching stable Ref becomes a tombstone

#### Scenario: Sync token is invalid
- **WHEN** Google rejects the stored sync token with its documented invalidation response
- **THEN** the Adapter records a warning, performs a full reconciliation, and advances to a new token only after a complete successful scan

#### Scenario: Scan is incomplete
- **WHEN** paging, parsing, cancellation, or provider I/O fails before completion
- **THEN** the previous cursor remains durable and absence alone produces no tombstones

### Requirement: Google Calendar normalization preserves event semantics
The Adapter SHALL normalize timed/all-day values, status, organizer, attendees, recurrence instance/series identity, visibility-safe text, and updated timestamps without treating HTML as trusted text. The `birthday` event variant SHALL be normalized as a standard all-day event with series linkage derived from its recurring-event identity, ignoring `birthdayProperties`. The `fromGmail` and `workingLocation` variants (and any other non-`default` variant) SHALL remain intentionally unindexed with the stable `google_calendar_unsupported_event` warning: `fromGmail` duplicates Gmail-derived context whose source of truth is the mailbox, and `workingLocation` carries presence metadata outside the calendar-event vocabulary. Unsupported event variants and malformed events SHALL yield bounded warnings or safe optional omissions rather than malformed Resources.

#### Scenario: Recurring instance is synchronized
- **WHEN** Google returns an expanded recurring occurrence with a recurring-event identity and original start
- **THEN** ctxindex emits a distinct stable occurrence Resource and a Profile-declared series Relation when its target can be formed

#### Scenario: All-day event crosses multiple dates
- **WHEN** Google returns date-only start and exclusive end values
- **THEN** the normalized payload retains the same half-open date range

#### Scenario: Birthday variant is synchronized
- **WHEN** Google returns an `eventType: birthday` recurring instance with date-only timing, a recurring-event identity, and `birthdayProperties`
- **THEN** ctxindex materializes it as a normal all-day `calendar.event@1` Resource with series linkage from the recurring-event identity and without any `birthdayProperties`-derived payload

#### Scenario: Working-location variant stays excluded
- **WHEN** Google returns an `eventType: workingLocation` or `eventType: fromGmail` event
- **THEN** the event is skipped with the stable `google_calendar_unsupported_event` warning and no Resource is emitted

### Requirement: Google Calendar retrieval and auth are bounded
Retrieval SHALL fetch only the selected calendar and event addressed by a canonical same-Source Ref, and all requests SHALL use the linked Grant and Google allowlisted hosts. The Adapter SHALL require only its declared read scope plus provider identity/refresh scopes and SHALL expose no write scope or Action.

#### Scenario: Foreign Source Ref is rejected
- **WHEN** retrieval receives an event Ref whose authority does not exactly match the Source
- **THEN** it fails before auth, network, or storage I/O

#### Scenario: Calendar-only consent is requested
- **WHEN** authorization selects only `google.calendar`
- **THEN** Gmail read/compose scopes are absent

### Requirement: Google Calendar has mocked and Human acceptance evidence
Automated loopback tests SHALL cover paging, incremental updates/deletions, invalid tokens, retrieval, exact scopes, malformed input, zero write routes, and generic CLI search/get. One explicit Human checkpoint SHALL verify a harmless live read from an approved calendar Source without exposing credentials or changing provider state.

#### Scenario: Human live checkpoint is approved
- **WHEN** the user explicitly completes Google consent and approves the bounded read check
- **THEN** evidence records exact scopes and successful event discovery/retrieval with identifiers and secrets redacted and no provider mutation

