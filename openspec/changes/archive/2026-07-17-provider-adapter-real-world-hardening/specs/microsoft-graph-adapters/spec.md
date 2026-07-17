## MODIFIED Requirements

### Requirement: Microsoft mailbox provides normalized read access
`microsoft.mailbox@1` SHALL implement federated discovery, complete retrieval, conversation Relations, attachment descriptors/download, and existing Profile exports through `communication.message@1`. Every Graph message request — including every page fetch of a remote search, initial page and `@odata.nextLink` continuations alike — SHALL explicitly opt into provider immutable ids via `Prefer: IdType="ImmutableId"`, every Ref SHALL be canonical and Source-scoped, and provider paging/errors SHALL map to existing normalized result/warning/error contracts. Draft create/update requests SHALL carry the same immutable-id preference so returned Draft Refs are immutable-id based.

#### Scenario: Outlook discovery returns messages
- **WHEN** an eligible Microsoft mailbox Source receives a generic remote search
- **THEN** Graph results are normalized into communication message Resources with stable immutable-id Refs and common search envelopes

#### Scenario: Message moves folders
- **WHEN** a provider message moves within the same mailbox
- **THEN** retrieval and subsequent discovery retain its existing immutable-id Resource Ref

#### Scenario: Multi-page search proves the immutable-id preference
- **WHEN** a remote search paginates through an initial page and one or more `@odata.nextLink` pages
- **THEN** every page request provably includes the `Prefer: IdType="ImmutableId"` header

#### Scenario: Conversation is traversed
- **WHEN** multiple Outlook messages share provider conversation identity and reply metadata
- **THEN** Profile Relations allow generic `thread get` to return their deterministic union

### Requirement: Microsoft Calendar shares the calendar Profile
`microsoft.calendar@1` SHALL be an indexed, read-only Adapter for one explicitly selected/default Microsoft calendar and an explicit rolling past/future coverage window. For the default calendar it SHALL use the stable Graph v1.0 `/me/calendarView/delta` contract and persist opaque next/delta links only after commit. For an explicitly named calendar it SHALL use the stable Graph v1.0 `/me/calendars/{id}/calendarView` contract as a complete paged window scan with manifest reconciliation and SHALL NOT use the beta per-calendar delta route. Both paths SHALL normalize recurrence and time-zone/all-day semantics into `calendar.event@1` and emit tombstones only after a successful delta or complete scan. Event normalization SHALL treat explicit `null` values on optional Graph fields as absent rather than rejecting the event as malformed, and SHALL resolve occurrence-start provider time zones given either an IANA zone name or a Windows zone name (via a vetted CLDR windowsZones-derived mapping); names resolvable by neither route SHALL keep the stable `microsoft_calendar_unresolved_series_start` warning. It MUST expose no calendar mutation Action or write scope.

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

#### Scenario: Occurrence start uses a Windows zone name
- **WHEN** an occurrence start's provider time zone is a Windows zone name such as `Greenwich Standard Time`
- **THEN** the zone resolves through the Windows-to-IANA mapping and series identity is preserved

#### Scenario: Occurrence start uses an IANA zone name
- **WHEN** an occurrence start's provider time zone is an IANA name such as `Europe/Belgrade`
- **THEN** the zone resolves directly and series identity is preserved

#### Scenario: Google and Microsoft events match one query
- **WHEN** both calendar Sources contain matching event text in the selected Realm
- **THEN** generic local search returns both through the same Profile and field grammar
