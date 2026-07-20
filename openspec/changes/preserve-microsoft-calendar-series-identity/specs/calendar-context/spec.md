## MODIFIED Requirements

### Requirement: Calendar Event Profile is provider-neutral
The system SHALL define `calendar.event@1` as a strict Profile for one provider event occurrence or series record. Its validated payload SHALL distinguish timed intervals from all-day half-open date ranges and represent title, description, location, status, organizer, attendees, provider calendar/event identity, recurrence/series linkage, creation/update time, and provider URL only through provider-neutral fields. Timed start/end time zones SHALL use canonical IANA names when present, and the Profile SHALL expose them as optional `startTimeZone` and `endTimeZone` typed string fields; all-day events SHALL expose neither time-zone field.

#### Scenario: Timed event validates
- **WHEN** an Adapter emits a timed event with ordered RFC 3339 start/end instants and optional canonical IANA time-zone names
- **THEN** the Profile accepts it and exposes deterministic title/time/calendar/status/start-time-zone/end-time-zone typed fields and searchable chunks

#### Scenario: All-day event validates
- **WHEN** an Adapter emits an all-day event with ISO local start date and exclusive end date
- **THEN** the Profile preserves date semantics without inventing a UTC midnight instant and exposes no time-zone typed fields

#### Scenario: Invalid mixed timing is rejected
- **WHEN** a payload supplies both timed and all-day timing or an end not after its start
- **THEN** Profile validation fails before storage

### Requirement: Calendar timezone and all-day representation
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Timed calendar event payloads MUST store canonical IANA timezone strings (`Europe/Ljubljana`, `UTC`, etc.) alongside their RFC 3339 start and end instants when source time-zone semantics are available so display can round-trip the original zone. The Profile MUST project those values through optional `startTimeZone` and `endTimeZone` typed string fields. Recurrence rules MUST be stored as their iCal RRULE strings; runtime expansion uses the timezone field.

All-day event payloads MUST store ISO local start dates and exclusive end dates and MUST NOT invent UTC-midnight instants. A timing discriminator MUST preserve date-only semantics so display can avoid timezone shifts, and all-day events MUST NOT project timed-event timezone fields.

#### Scenario: Calendar display round-trips timezone and all-day semantics
- **WHEN** a timed event carries canonical IANA start/end zones or an all-day event carries local dates
- **THEN** typed fields expose the timed zones and omit them for the all-day event while both payloads preserve their respective display semantics
