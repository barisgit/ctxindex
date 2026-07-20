## Context

The 2026-07-17 provider-hardening change made Microsoft Graph optional fields null-tolerant and added a CLDR-derived Windows-to-IANA resolver. Its synthetic Windows, IANA, unknown-zone, and DST-gap fixtures pass. A later full live resync materialized all 43 events but produced 26 `microsoft_calendar_unresolved_series_start` warnings and zero `payload.series` values. The private replay established one exact affected shape: a delta occurrence carried distinct occurrence and series-master ids plus UTC start/end values with seven fractional digits, but omitted `originalStart`, `originalStartTimeZone`, and `originalEndTimeZone`. DTO parsing, UTC zone resolution, and final Profile validation all succeeded; series construction stopped because no provider-supplied original occurrence start existed.

Microsoft's public v1.0 event contract documents `seriesMasterId` for recurring-series members and `originalStart` as a UTC `DateTimeOffset` for occurrences and exceptions. Calendar-view delta is documented to return occurrences and exceptions, but the replay proves that at least one production delta occurrence omitted the property. The delta endpoint does not support `$select`, so the documented request contract exposes no projection that can require it.

The shared development session must not read credentials, global ctxindex state, live provider payloads, or operator artifacts. A private agent with approved provider access must capture only a minimal redacted replay shape before production behavior changes.

## Goals / Non-Goals

**Goals:**

- Establish the exact normalization bypass with a redacted replay test before changing production behavior.
- Preserve stable series-master provider identity, canonical same-Source Ref, and correct original occurrence start for valid Graph occurrences/exceptions.
- Store Microsoft timed-event and series-start zones as canonical IANA names and expose timed zones through provider-neutral typed fields.
- Retain bounded warnings for unknown zones, nonexistent local times, or genuinely absent/unrepresentable series-start data.
- Verify the fix with focused normalization/sync tests, compiled mixed-provider replay, and a private isolated live resync.

**Non-Goals:**

- Recurrence expansion or a change to recurring-event storage policy.
- Fabricating `seriesMasterId`, exception `originalStart`, or any other absent Graph property from event ids, titles, recurrence rules, or iCalendar identity. An unmodified `occurrence` may use its own start because Graph's event type establishes that it has not moved from the series schedule.
- Microsoft mailbox retrieval, provider mutations, scopes, auth, core/storage branches, migrations, or new dependencies.
- Persisting raw or identifying live event content in Git.

## Decisions

### D1. The redacted replay fixture establishes the structural bypass

The private checkpoint captured one affected occurrence's minimal normalization-relevant shape and redacted every opaque identifier and user-content field while preserving property presence, JSON types, date-time syntax, zone syntax, `type`, and the distinction between occurrence and series-master ids. Replaying that fixture through the unmodified normalizer materializes the Resource, omits `payload.series`, and emits `microsoft_calendar_unresolved_series_start`.

The bypass is absence of `originalStart`, not a DTO-schema, date-time syntax, zone-resolution, or precedence defect. The fixture intentionally omits both original-zone fields as the matching delta occurrence did. A fixture guessed from Microsoft documentation is rejected: all currently documented-shape fixtures already pass, so another synthetic case would not identify the live bypass. Raw payload capture in the shared session is also rejected by the privacy boundary.

### D2. Preserve provider identity and use occurrence semantics narrowly

For a valid occurrence or exception, normalization continues to derive `series.providerEventId` directly from Graph's series-master identity and `series.ref` through the existing Source-scoped event Ref helper. A provider-supplied `originalStart` remains authoritative. When calendar-view delta omits that property on an event whose provider-supplied `type` is exactly `occurrence`, normalization uses its current start as the original occurrence start: Graph distinguishes an unmodified occurrence from an `exception`, whose start may have moved. No fallback applies to exceptions or events with absent/unknown type, and no series identity is synthesized from `iCalUId`, event-id structure, subject, or recurrence rules.

The stable Graph event contract describes `originalStart` as a UTC `DateTimeOffset` for occurrences and exceptions, while the calendar-view delta contract includes those event kinds but does not provide a projection that can require the missing property. It also defines `occurrence` separately from `exception`; only exceptions can differ from ordinary occurrences, including by start time. This type distinction supplies the narrow correction demonstrated by the replay: use current start only for `type: "occurrence"`, while an exception missing `originalStart` retains the bounded warning and omitted series linkage. A secondary event GET is unnecessary and would add provider I/O without improving the exception case.

### D3. Canonicalize zones at the Adapter boundary

Microsoft may expose Windows or IANA zone names, while Google may expose IANA aliases. The Profile-owned canonicalizer validates canonical IANA vocabulary through a pinned IANA-backward mapping plus the runtime zone inventory. Before dropping a valid name absent from that inventory, it asks `Intl.DateTimeFormat(...).resolvedOptions().timeZone` for a canonical link target; the pinned table still runs first so known legacy names cannot bypass their intended replacement. Both Adapters reuse this seam; Microsoft's vetted Windows resolver maps Windows names before the same boundary. They emit canonical values into `timing.startTimeZone`, `timing.endTimeZone`, and timed `series.originalStart.timeZone` when a zone is available. Provider raw Windows labels and IANA aliases remain provider DTO details and do not cross into the provider-neutral payload.

Unknown/custom zones remain omitted rather than guessed. An occurrence that otherwise has an explicit valid UTC/offset original start may retain series identity without attaching an unresolved zone label; a local wall time that requires an unknown zone or falls in a DST gap remains unrepresentable and warns.

### D4. Expose start and end zones as typed Profile fields

The Calendar Event Profile will expose optional `startTimeZone` and `endTimeZone` string fields for timed events and reject non-canonical zone strings. This mirrors the existing payload shape, keeps field extraction and validation provider-neutral, and avoids collapsing potentially different start/end zone semantics into one ambiguous `timeZone` field. All-day events expose neither field.

## Risks / Trade-offs

- [Redaction changes the failing shape] → Require the private agent to replay the redacted fixture through the unmodified normalizer before transfer and report only the stable warning/result summary.
- [The live delta payload omits a property described by the event resource contract] → Use current start only for provider-typed unmodified occurrences; keep the bounded warning for exceptions and unknown event types.
- [Canonicalization omits a legacy/custom Microsoft zone] → Keep provider instants when independently valid, omit the unrepresentable zone label, and retain the existing warning when a series start depends on that zone.
- [Adding typed fields changes registry snapshots] → Update focused Profile/registry and compiled workflow expectations together; this is additive pre-alpha vocabulary.
- [Existing locally materialized Windows labels remain non-canonical] → The repository is pre-alpha; isolated resync is the recovery and no migration is added.

## Migration Plan

No schema migration. Re-sync affected Microsoft Calendar Sources after the fix so provider-derived payloads and field-index rows are rebuilt with preserved series identity and canonical zone values.

## Replay-resolved findings and remaining decision

- The reproducing shape has `type: "occurrence"`, distinct non-empty occurrence and series-master ids, offset-less UTC start/end values with seven fractional digits, and no `originalStart`, `originalStartTimeZone`, or `originalEndTimeZone` properties.
- The replay requires DTO recognition of the provider-supplied event `type`, but no secondary fetch or new date-time/zone parser. The provider-supplied `originalStart` is absent.
- The provider's `occurrence` classification proves the event is an unmodified series member, so its current start is the original occurrence start. Exceptions and unknown types never receive this fallback.

## Public Graph references

- [Event resource type](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0): `type`, `seriesMasterId`, `originalStart`, `iCalUId`, and time-zone property contracts.
- [Incremental changes to events in a calendar view](https://learn.microsoft.com/en-us/graph/delta-query-events): calendar-view delta occurrence/exception and opaque cursor behavior.
- [dateTimeTimeZone resource type](https://learn.microsoft.com/en-us/graph/api/resources/datetimetimezone?view=graph-rest-1.0): date-time string shape and Windows/additional zone vocabulary.
