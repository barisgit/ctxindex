# Microsoft Graph Adapters Specification

## Purpose
Define Microsoft mailbox and calendar authorization, synchronization, search, retrieval, normalization, and Draft behavior through Microsoft Graph.
## Requirements
### Requirement: Microsoft identity supports personal and organizational Accounts
The `microsoft` OAuth provider SHALL use Microsoft identity platform authorization-code flow with PKCE, state/redirect validation, refresh support, and endpoints/scopes valid for both approved Outlook.com personal Accounts and Microsoft 365 organizational Accounts. The stable provider subject SHALL be Graph `/v1.0/me` `id`, not the client-pairwise OIDC `sub`; the verified Graph identity from that response SHALL be the default Account-label candidate, while an explicit `--label` MAY set the local Account label. Tenant/account choice MUST NOT be inferred from email suffix.

#### Scenario: Personal Microsoft Account authorizes
- **WHEN** an approved personal Account runs `account add microsoft` with the Microsoft Adapters loaded
- **THEN** one Microsoft Account and Grant are stored with the exact granted delegated scopes

#### Scenario: Organizational Account authorizes
- **WHEN** an approved Microsoft 365 Account completes the same provider-neutral flow
- **THEN** its distinct stable identity is stored without changing Realm or Source selection

### Requirement: Microsoft mailbox provides normalized read access
`microsoft.mailbox` SHALL implement federated discovery, complete retrieval, conversation Relations, attachment descriptors/download, and existing Profile exports through `mail.message@1`. Every Graph message request — including every page fetch of a remote search, initial page and `@odata.nextLink` continuations alike — SHALL explicitly opt into provider immutable ids via `Prefer: IdType="ImmutableId"`, every Ref SHALL be canonical and Source-scoped, and provider paging/errors SHALL map to existing normalized result/warning/error contracts. Draft create/update requests SHALL carry the same immutable-id preference so returned Draft Refs are immutable-id based.

#### Scenario: Outlook discovery returns messages
- **WHEN** an eligible Microsoft mailbox Source receives a generic remote search
- **THEN** Graph results are normalized into mail message Resources with stable immutable-id Refs and common search envelopes

#### Scenario: Message moves folders
- **WHEN** a provider message moves within the same mailbox
- **THEN** retrieval and subsequent discovery retain its existing immutable-id Resource Ref

#### Scenario: Multi-page search proves the immutable-id preference
- **WHEN** a remote search paginates through an initial page and one or more `@odata.nextLink` pages
- **THEN** every page request provably includes the `Prefer: IdType="ImmutableId"` header

#### Scenario: Conversation is traversed
- **WHEN** multiple Outlook messages share provider conversation identity and reply metadata
- **THEN** Profile Relations allow generic `thread` retrieval to return their deterministic union

### Requirement: Outlook attachments use managed Artifacts
Microsoft file attachment metadata SHALL become Profile-derived Artifact descriptors without eagerly storing bytes. Download SHALL use the canonical message/attachment identity through the linked Grant, stream exact bytes into the managed content-addressed store, and reuse cached bytes on later requests. Unsupported non-file attachment kinds SHALL be represented safely or warned without corrupting the parent Resource.

#### Scenario: File attachment is downloaded once
- **WHEN** an uncached Outlook file Artifact is requested
- **THEN** exactly one Graph download supplies bytes to the managed store and a second request uses the cache

#### Scenario: Malformed attachment Ref is supplied
- **WHEN** an Artifact identity does not canonically belong to the Source/message
- **THEN** download fails before auth or provider I/O

### Requirement: Outlook implements reversible Draft Actions
`microsoft.mailbox` SHALL bind exactly `mail.message.draft.create` and `mail.message.draft.update` using delegated `Mail.ReadWrite` and MUST NOT request `Mail.Send`. Create SHALL perform exactly one provider Draft-create mutation and return a stable immutable-id Draft Ref. Update SHALL validate a canonical same-Source Draft Ref and complete replacement recipients/subject/text before exactly one provider update mutation, returning the same Ref. Core and Adapter mutation paths MUST NOT retry either operation automatically.

#### Scenario: Outlook Draft is created
- **WHEN** valid Draft input is run through an explicit Microsoft mailbox Source
- **THEN** one Graph Draft-create request persists it and returns a complete normalized Draft Resource

#### Scenario: Outlook Draft is replaced
- **WHEN** complete updated input addresses that Draft Ref
- **THEN** one Graph update request changes recipients, subject, and text while preserving the Ref

#### Scenario: Send-like Action is attempted
- **WHEN** an agent describes or invokes a send-like Action id
- **THEN** no such Action or binding exists and no Graph send route is called

### Requirement: Microsoft Calendar shares the calendar Profile
`microsoft.calendar` SHALL be an indexed, read-only Adapter for one explicitly selected/default Microsoft calendar and an explicit rolling past/future coverage window. For the default calendar it SHALL use the stable Graph v1.0 `/me/calendarView/delta` contract and persist opaque next/delta links only after commit. For an explicitly named calendar it SHALL use the stable Graph v1.0 `/me/calendars/{id}/calendarView` contract as a complete paged window scan with manifest reconciliation and SHALL NOT use the beta per-calendar delta route. Both paths SHALL normalize recurrence and time-zone/all-day semantics into `calendar.event@1` and emit tombstones only after a successful delta or complete scan. Event normalization SHALL treat explicit `null` values on optional Graph fields as absent rather than rejecting the event as malformed, and SHALL resolve occurrence-start provider time zones given either an IANA zone name or a Windows zone name (via a vetted CLDR windowsZones-derived mapping); names resolvable by neither route SHALL keep the stable `microsoft_calendar_unresolved_series_start` warning. It MUST expose no calendar mutation Action or write scope.

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

### Requirement: Microsoft egress and consent are bounded and verified
Production requests SHALL contact only the declared Microsoft identity and Graph hosts. Automated loopback tests SHALL prove the exact all-loaded same-provider scope union, token refresh/rotation, read paging/delta, immutable ids, attachments, Draft create/update, malformed-input zero I/O, and absence of send routes. An explicit Human checkpoint SHALL verify approved Microsoft login, harmless mailbox/calendar reads, one Draft create and one update, and visible confirmation that nothing was sent.

#### Scenario: Loaded calendar contributes its scope
- **WHEN** `account add microsoft` runs with `microsoft.mailbox` and `microsoft.calendar` loaded
- **THEN** consent includes both Adapters' scopes, including `Mail.ReadWrite` for Draft support, while `Mail.Send` is absent

#### Scenario: Human Microsoft checkpoint completes
- **WHEN** the user explicitly approves consent and the bounded live workflow
- **THEN** redacted evidence records mailbox/calendar reads and one stable Draft create/update, followed by user confirmation that no message was sent
