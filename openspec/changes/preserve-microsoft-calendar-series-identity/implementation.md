## Capability Implementation Targets

- `calendar-context` → `openspec/specs/calendar-context/implementation.md`
- `google-calendar-adapter` → `openspec/specs/google-calendar-adapter/implementation.md`
- `microsoft-graph-adapters` → `openspec/specs/microsoft-graph-adapters/implementation.md`

## Module Ownership

`@ctxindex/profiles` continues to own the strict provider-neutral Calendar Event payload and pure field projections. Its timed timing union remains the only public payload seam for start/end instants and optional zones; the change extends declarative search vocabulary rather than adding provider logic or a second time-zone model.

`@ctxindex/adapters` owns provider DTO tolerance, date-time conversion, Source-scoped Ref construction, warnings, and sync/retrieve normalization. Google and Microsoft calendar normalization reuse the Profile-owned IANA canonicalizer; Microsoft additionally maps Windows labels before that seam. The Microsoft calendar normalizer remains the single mapping path shared by Sync and Retrieve. Core, storage, search, and CLI consume only Profile definitions and generic Resource emissions and gain no provider-specific branch.

## Interfaces and Data Flow

`CalendarEvent` remains inferred from `calendarEventSchema`. Timed payloads retain `timing.startTimeZone?: string` and `timing.endTimeZone?: string`; `calendarEventProfile.search.fields` adds matching optional string extractors. `canonicalizeIanaTimeZone(value)` is the Profile-owned seam that maps recognized links and validates the canonical zone strings admitted by event timing and series starts; Adapters reuse it rather than duplicating vocabulary.

`normalizeMicrosoftCalendarEvent(input, sourceId, calendarId)` retains its current result contract. It validates provider DTOs including the closed Graph event-type vocabulary, resolves provider zones through the existing `resolveTimeZone` seam, converts occurrence-start data without provider I/O, builds series Refs through `calendarEventRef`, validates the provider-neutral payload, and returns Resource/warnings. Provider-supplied `originalStart` remains authoritative; only `type: occurrence` may use its current start when Graph omits that property, while exceptions and unknown types fail closed. Explicit offset/UTC occurrence starts do not depend on a raw provider zone to establish their instant; local wall times cross the zone-resolution/DST failure boundary.

Sync and Retrieve continue to inject Graph fetch effects and call the same pure normalizer. The series-identity change adds no secondary fetch, recurrence expansion, or identifier lookup. Warning emission stays in the existing normalization result so Sync remains transactional and Retrieve logs the same stable diagnostic class.

## Storage and State

No new storage owner, cursor field, table, or migration. Generic Resource upserts rebuild payload and Profile field-index projections on resync. Existing pre-alpha materializations may retain missing series/canonical zones until resynchronized.

## Security and Compatibility

The production Adapter retains the existing Microsoft Graph v1.0 host, immutable-id/UTC request preferences, delegated read-only calendar scope, and no calendar Actions. The replay fixture must contain no real opaque ids, people, titles, descriptions, locations, URLs, account/calendar labels, or timestamps that identify a user; it preserves only the structural/date-time/zone characteristics required to reproduce the branch.

No credentials, live global ctxindex state, operator artifacts, or provider payloads enter automated tests or the shared development lane. The private live checkpoint uses isolated state and reports counts/assertions plus a redacted fixture, never raw payloads or tokens. The change is additive pre-alpha Profile vocabulary and creates no deprecated alias or compatibility layer.

## Verification

Focused Calendar Event Profile tests prove canonical timed-zone field extraction and all-day omission. Microsoft Calendar normalization tests first reproduce the redacted live bypass, then cover the fixed replay alongside valid Windows, valid IANA, explicit UTC/offset, unknown-zone, DST-gap, all-day, and malformed shapes. Sync/retrieve tests prove the shared normalizer emits stable series identity without changing cursor/transaction behavior.

The compiled mixed-provider calendar workflow/replay proves schema/registry packaging and Microsoft/Google coexistence. A private isolated full Microsoft Calendar resync verifies that valid recurring events now carry series identity with no malformed skips while genuinely invalid cases keep their warning. Final repository verification remains `bun run ci`, strict OpenSpec validation, and `openspec-verify-change` before archive.

## Promotion Notes

- Merge into `openspec/specs/calendar-context/implementation.md`: timed Calendar Event zones remain in the schema-derived timing union and gain provider-neutral `startTimeZone`/`endTimeZone` declarative field projections; no provider-specific or core dependency is introduced.
- Merge into `openspec/specs/google-calendar-adapter/implementation.md`: Google timed-event and series-start zone labels pass through the Profile-owned canonicalizer, preserving offset-bearing instants while omitting unknown labels.
- Merge into `openspec/specs/microsoft-graph-adapters/implementation.md`: Microsoft Calendar Sync/Retrieve share the pure normalizer and existing zone resolver for canonical payload zones and Source-scoped series construction; explicit instants and local-wall-time zone failures remain distinct normalization boundaries, with no added provider I/O.
