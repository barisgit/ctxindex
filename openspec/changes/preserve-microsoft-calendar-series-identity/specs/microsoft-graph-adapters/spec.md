## MODIFIED Requirements

### Requirement: Microsoft Calendar shares the calendar Profile
`microsoft.calendar@1` SHALL be an indexed, read-only Adapter for one explicitly selected/default Microsoft calendar and an explicit rolling past/future coverage window. For the default calendar it SHALL use the stable Graph v1.0 `/me/calendarView/delta` contract and persist opaque next/delta links only after commit. For an explicitly named calendar it SHALL use the stable Graph v1.0 `/me/calendars/{id}/calendarView` contract as a complete paged window scan with manifest reconciliation and SHALL NOT use the beta per-calendar delta route. Both paths SHALL normalize recurrence and time-zone/all-day semantics into `calendar.event@1` and emit tombstones only after a successful delta or complete scan. Event normalization SHALL treat explicit `null` values on optional Graph fields as absent rather than rejecting the event as malformed. For valid recurring occurrences and exceptions, it SHALL preserve the provider-supplied series-master id as `series.providerEventId`, construct the canonical same-Source series Ref, and prefer the provider-supplied original occurrence start. When Graph omits `originalStart` for an event explicitly typed as an unmodified `occurrence`, the Adapter SHALL use that occurrence's current start; it MUST NOT apply that fallback to an `exception` or unknown event type. It SHALL resolve Microsoft event and occurrence-start time zones given either an IANA zone name or a Windows zone name through the vetted mapping and SHALL emit canonical IANA values in provider-neutral timed payloads. `microsoft_calendar_unresolved_series_start` SHALL be emitted only when a recurring member's original start genuinely cannot be represented, including a missing exception start, an unknown required zone, or a nonexistent local time. It MUST expose no calendar mutation Action or write scope.

#### Scenario: Delta sync advances
- **WHEN** all pages of a Microsoft calendar delta response succeed
- **THEN** normalized events/tombstones commit and only the final opaque delta cursor becomes durable

#### Scenario: Delta cursor expires
- **WHEN** Graph rejects an old delta cursor
- **THEN** a complete bounded reconciliation replaces it without tombstoning from a partial scan

#### Scenario: Named calendar synchronizes on stable Graph
- **WHEN** a Source selects an explicit non-default calendar id
- **THEN** each sync performs a complete paged v1.0 calendar-view scan, reconciles against its manifest after all pages succeed, and stores no beta delta link

#### Scenario: Graph nulls optional fields
- **WHEN** Graph returns an otherwise-valid event whose optional fields (such as `seriesMasterId`, `recurrence`, or `occurrenceId`) are explicit `null`
- **THEN** the event materializes as if those fields were absent, with no `microsoft_calendar_malformed_event` warning

#### Scenario: Recurring occurrence preserves series identity
- **WHEN** Graph returns a valid occurrence or exception with provider-supplied series-master identity and representable original start
- **THEN** the materialized event carries that exact series provider id, its canonical same-Source Ref, and the correct original start without `microsoft_calendar_unresolved_series_start`

#### Scenario: Delta omits an unmodified occurrence original start
- **WHEN** Graph returns `type: occurrence`, a provider-supplied series-master id, and a representable current start but omits `originalStart`
- **THEN** the Adapter uses the occurrence start as its original start and preserves canonical series identity without secondary provider I/O

#### Scenario: Delta omits an exception original start
- **WHEN** Graph returns `type: exception` and a provider-supplied series-master id but omits `originalStart`
- **THEN** the Adapter does not substitute the potentially moved current start, omits series linkage, and emits `microsoft_calendar_unresolved_series_start`

#### Scenario: Windows event zone becomes canonical
- **WHEN** a Microsoft timed event or occurrence start uses a recognized Windows zone name such as `Greenwich Standard Time`
- **THEN** the Adapter emits the mapped canonical IANA zone in the Calendar Event payload and preserves valid series identity

#### Scenario: IANA event zone remains canonical
- **WHEN** a Microsoft timed event or occurrence start uses an IANA name such as `Europe/Belgrade`
- **THEN** the Adapter emits that canonical IANA zone and preserves valid series identity

#### Scenario: Original start is genuinely unrepresentable
- **WHEN** a recurring member supplies a local original start in an unknown required zone or a nonexistent DST-gap wall time
- **THEN** the event materializes without series linkage and emits `microsoft_calendar_unresolved_series_start`

#### Scenario: Google and Microsoft events match one query
- **WHEN** both calendar Sources contain matching event text in the selected Realm
- **THEN** generic local search returns both through the same Profile and field grammar
