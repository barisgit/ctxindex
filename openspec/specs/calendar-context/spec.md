# Calendar Context Specification

## Purpose
Define provider-neutral calendar event vocabulary, identity, retrieval, rolling sync coverage, and read-only behavior.

## Requirements

### Requirement: Calendar Event Profile is provider-neutral
The system SHALL define `calendar.event@1` as a strict Profile for one provider event occurrence or series record. Its validated payload SHALL distinguish timed intervals from all-day half-open date ranges and represent title, description, location, status, organizer, attendees, provider calendar/event identity, recurrence/series linkage, creation/update time, and provider URL only through provider-neutral fields.

#### Scenario: Timed event validates
- **WHEN** an Adapter emits a timed event with ordered RFC 3339 start/end instants and optional source time-zone labels
- **THEN** the Profile accepts it and exposes deterministic title/time/calendar/status typed fields and searchable chunks

#### Scenario: All-day event validates
- **WHEN** an Adapter emits an all-day event with ISO local start date and exclusive end date
- **THEN** the Profile preserves date semantics without inventing a UTC midnight instant

#### Scenario: Invalid mixed timing is rejected
- **WHEN** a payload supplies both timed and all-day timing or an end not after its start
- **THEN** Profile validation fails before storage

### Requirement: Calendar identity remains Source-scoped and stable
Every calendar Resource SHALL use `ctx://<UPPERCASE-source-id>/event/<encodeURIComponent(adapter-opaque-event-id)>` and retain the same Ref across ordinary provider updates. The entire case-sensitive opaque id SHALL be percent-encoded as one path component. Provider calendar id and event id remain payload metadata; recurring instances MAY relate to a series Ref but MUST NOT collapse distinct occurrences or cross-Source copies.

#### Scenario: Event title and time change
- **WHEN** the provider updates mutable event fields without replacing its stable event identity
- **THEN** sync replaces one Resource payload under the existing Ref

#### Scenario: Same provider event is selected by two Sources
- **WHEN** overlapping Sources emit the same external event
- **THEN** each Source retains its own Resource Ref and no implicit cross-source deduplication occurs

### Requirement: Calendar vocabulary drives generic search and retrieval
The Profile SHALL own pure deterministic search text, bounded chunks, typed fields, Relations, aliases, and documentation. Calendar Adapters SHALL materialize through generic Sync emissions and retrieval; core, storage, search, CLI, and export code MUST NOT contain Google- or Microsoft-calendar branches or domain tables.

#### Scenario: Cross-provider event search
- **WHEN** Google and Microsoft calendar Sources have synchronized matching events
- **THEN** one generic search returns both `calendar.event` Resources with the common result envelope and exact Realm/Source filters

#### Scenario: Event is retrieved by Ref
- **WHEN** a complete event is absent locally and its Source supports retrieval
- **THEN** generic `get` invokes the owning Adapter and caches the normalized event as an ad-hoc Resource

### Requirement: Indexed calendar coverage is an explicit rolling window
Each indexed calendar Source SHALL expose registry-derived past/future coverage configuration and persist the exact anchored UTC window with its provider cursor. Incremental requests MUST retain that window until a deliberate bounded full reconciliation advances it. A window refresh MUST compare a complete successful scan with the previous manifest so events leaving coverage are tombstoned; a partial or uncertain scan MUST preserve the prior cursor and Resources.

#### Scenario: Incremental sync retains its window
- **WHEN** a Source has a valid delta/sync cursor for an anchored calendar range
- **THEN** subsequent incremental requests use the provider state for exactly that range rather than silently moving the bounds

#### Scenario: Rolling window advances
- **WHEN** the configured horizon requires a newer coverage window
- **THEN** the Adapter performs a complete reconciliation, tombstones prior events now outside coverage, and persists the new bounds/token only after commit

#### Scenario: Caller chooses wider history
- **WHEN** Source configuration increases the past or future coverage days
- **THEN** the next synchronization performs a full reconciliation using the declared wider window

### Requirement: Calendar Sources are read-only
The calendar Profile SHALL declare no provider mutation Action in V1, and Google/Microsoft calendar Adapters MUST NOT call create, update, delete, RSVP, invite, or notification endpoints.

#### Scenario: Registry is inspected
- **WHEN** an agent describes `calendar.event` and its implementing Adapters
- **THEN** no calendar mutation Action is available

#### Scenario: Sync observes a provider deletion
- **WHEN** an event disappears or is cancelled according to the provider incremental contract
- **THEN** the Adapter emits a local tombstone and performs no provider mutation

### Requirement: Recurring event storage and expansion
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A recurring calendar event MUST be modeled as a single series resource plus stored exception resources for occurrences that differ from the series or are cancelled. Standard, unmodified recurring occurrences MUST NOT be materialized as separate resources in storage. This modeling lives in the `calendar.event` profile, not in core.

Time-window views of recurring events SHOULD be produced by runtime expansion of the series recurrence rule over a bounded query window, not by precomputed per-occurrence rows.

Cancellation of a single occurrence MUST be represented as a stored exception, not as a separate cancelled event row. Cancellation of an entire series MUST be represented by tombstoning the series resource.

#### Scenario: Recurring event instances are represented without materializing ordinary occurrences
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

### Requirement: Calendar timezone and all-day representation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Timed calendar event payloads MUST store the IANA timezone string (`Europe/Ljubljana`, `UTC`, etc.) alongside their RFC 3339 start and end instants so display can round-trip the original timezone. Recurrence rules MUST be stored as their iCal RRULE strings; runtime expansion uses the timezone field.

All-day event payloads MUST store ISO local start dates and exclusive end dates and MUST NOT invent UTC-midnight instants. A timing discriminator MUST preserve date-only semantics so display can avoid timezone shifts.

#### Scenario: Calendar display round-trips timezone and all-day semantics
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings
