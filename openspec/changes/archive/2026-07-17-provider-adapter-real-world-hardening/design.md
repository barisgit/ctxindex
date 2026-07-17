## Context

The first live multi-provider sync (2026-07-17, see `evidence.md`) surfaced four hardening gaps in the Google Calendar and Microsoft Graph adapters. All four degrade gracefully today (warnings, skipped events, lucky gets) but silently exclude or destabilize real data. Root causes for symptoms 1 and 4 were confirmed live before design; this document decides only HOW to fix them. No storage, core, CLI, auth, or Profile schema changes. All verification runs from fixtures — no live provider credentials exist on the development host.

## Goals / Non-Goals

**Goals:**

- Microsoft Calendar events with Graph's explicit `null` optional fields materialize instead of being skipped as malformed.
- Google Calendar `birthday`-variant events materialize as normal all-day events with series linkage; sibling variants get an explicit documented decision.
- Microsoft occurrence-start resolution accepts both Windows and IANA time zone names so series identity is preserved.
- Microsoft mailbox `search-remote` provably sends `Prefer: IdType="ImmutableId"` on every page fetch, and Draft create/update responses provably carry immutable-id semantics.

**Non-Goals:**

- No migration of existing materialized rows (pre-alpha; purge/re-search is the documented recovery).
- No new provider Actions, scopes, or write paths.
- No general time zone conversion library or heavy dependency.
- No changes to warning codes: codes remain stable and are still emitted for genuinely unmappable events.

## Decisions

### D1. Null tolerance via a `nullish`-to-`undefined` schema helper (symptom 1)

Graph serializes absent optional fields as explicit `null`; the adapter schema uses zod `.optional()` which rejects `null` (confirmed: `seriesMasterId: null` → `microsoft_calendar_malformed_event`, 43 skips). Fix: wrap every optional field of `microsoftCalendarEventSchema` that Graph can null with a local helper that accepts `null` and transforms it to `undefined` (`schema.nullish().transform(v => v ?? undefined)` semantics). Treating null-as-absent at the schema boundary means zero downstream logic changes — all existing `=== undefined` / spread guards keep working.

Audited field set (siblings Graph nulls alongside the confirmed `seriesMasterId`): `subject`, `body`, `bodyPreview`, `location`, `location.displayName`, `start`, `end`, `isAllDay`, `originalStartTimeZone`, `originalEndTimeZone`, `organizer`, `attendees`, `isCancelled`, `showAs`, `seriesMasterId`, `originalStart`, `webLink`, `createdDateTime`, `lastModifiedDateTime`, plus nested `emailAddress.name`/`address` and attendee `status`. `recurrence` is `z.unknown()` and already accepts `null` (guarded downstream with `!= null`). `occurrenceId: null` flows through `.passthrough()` untouched.

Alternative considered: preprocess the raw event to strip nulls before parsing. Rejected — a recursive strip is more code, loses per-field intent, and would also strip meaningful nulls inside `.passthrough()` extras.

A fixture cloned from the redacted evidence shape (singleInstance, `seriesMasterId: null`, `recurrence: null`, `occurrenceId: null`, `originalStartTimeZone: "Greenwich Standard Time"`) becomes a regression test that must materialize with zero warnings.

### D2. Map Google `birthday` as a normal all-day event; explicitly exclude `fromGmail`/`workingLocation` (symptom 2)

Live evidence shows a `birthday` event is a standard all-day recurring instance (`start.date`/`end.date`, `recurringEventId`, `originalStartTime`) plus a `birthdayProperties` object. Decision: treat `eventType: "birthday"` exactly like `default` — normal all-day mapping with series linkage from `recurringEventId`; `birthdayProperties` is ignored (retained only via `.passthrough()`, never mapped — it adds no Profile-relevant data beyond what the event already carries).

Sibling variants stay excluded, with the decision recorded in the spec delta:

- `fromGmail`: auto-generated from Gmail messages; the source of truth is the Gmail message itself (indexable via `google.mailbox`), and Google's API forbids most mutations on them. Indexing them would duplicate mailbox-derived context. Excluded; keeps `google_calendar_unsupported_event`.
- `workingLocation` (and the related `focusTime`/`outOfOffice` shapes): presence/availability metadata, not events a user would retrieve as calendar context; their payload semantics live outside `calendar.event@1` timing/participant vocabulary. Excluded; keeps `google_calendar_unsupported_event`.

Alternative considered: map every `eventType` as a plain event. Rejected — `workingLocation` events carry semantics (location declarations, all-day pseudo-events) that would materialize as misleading calendar entries.

The warning code `google_calendar_unsupported_event` is unchanged and still fires for non-`default`, non-`birthday` variants.

### D3. Windows→IANA mapping table from CLDR `windowsZones`, dual-name resolution (symptom 3)

Graph mixes Windows time zone names (`"Greenwich Standard Time"`) and IANA names (`"Europe/Belgrade"`) in `originalStartTimeZone` — observed live on one calendar. Occurrence-start resolution must accept both. Decision: add a vetted static table `windows-zones.ts` under `packages/adapters/src/microsoft/calendar/` — the CLDR `windowsZones.xml` `territory="001"` primary mappings (~140 entries, Windows name → canonical IANA zone) — plus a resolver:

1. If the name is a valid IANA zone (probed via `Intl.DateTimeFormat` with `timeZone`), use it as-is.
2. Else if the name is in the Windows table, use the mapped IANA zone.
3. Else resolution fails and the existing `microsoft_calendar_unresolved_series_start` warning fires (code unchanged).

The resolver feeds both occurrence-start paths in `event.ts`: the all-day path (`dateInTimeZone`, which needs an IANA zone for `Intl`) and the timed path (`instant` on `originalStart` values that lack an explicit offset, converting local wall time in the resolved zone to a UTC instant via an `Intl.DateTimeFormat` offset computation — no new dependency).

Alternatives considered: depend on `windows-iana`/`moment-timezone` (rejected: heavy or transitively large dependency for a static table; the D3 compiled-extension spike must stay green and small); calling Graph `outlookTimeZones` translation endpoint (rejected: extra provider I/O per sync and unavailable in fixture tests).

### D4. Explicit immutable-id preference on search-remote + per-page header proof (symptom 4)

Evidence (captured live) attributes mailbox Ref instability to `search-remote.ts` calling `graphHeaders()` without `IMMUTABLE_ID_PREFERENCE`. Code inspection during design shows `graphHeaders(prefer = IMMUTABLE_ID_PREFERENCE)` defaults to the immutable-id preference, so the header is already emitted by the default parameter and the existing test asserts it on every request. The confirmed live 400s are still real; the residual risk is Graph honoring semantics on `$search` result pages, which cannot be re-verified without live credentials.

Decision (smallest correct hardening within scope):

- Pass `IMMUTABLE_ID_PREFERENCE` explicitly at the `search-remote` call site so the contract no longer rides on a default parameter that a future `graphHeaders` refactor could silently change.
- Strengthen the search-remote test to assert the exact `Prefer: IdType="ImmutableId"` header on **every** page fetch of a multi-page search (first page and `@odata.nextLink` pages), importing the constant rather than duplicating the literal.
- Verify (existing assertions, kept) that Draft create/update requests send `TEXT_BODY_PREFERENCE` (which embeds `IMMUTABLE_ID_PREFERENCE`) so their responses carry immutable ids, matching the `message/<immutable-id>`/`draft/<immutable-id>` Ref contract in `ref.ts`.
- No data migration: pre-alpha materialized envelopes with mutable-id Refs are disposable; purge/re-search is the recovery path.

## Risks / Trade-offs

- [Graph may not honor `IdType="ImmutableId"` on `$search` pages despite the header] → Header is now explicit and proven per page; if live behavior still returns mutable ids, that is a provider-side limitation requiring a follow-up change (e.g. re-resolving ids at retrieve time), out of scope here. Documented so the next live smoke test checks Ref stability first.
- [Null-tolerant schema could mask genuinely broken events] → Only fields whose absence was already legal become null-tolerant; required invariants (`id` non-empty, timing coherence, payload validation via `calendarEventSchema`) are unchanged, so truly malformed events still warn with the same stable code.
- [Static Windows→IANA table drifts from CLDR] → The table maps stable Windows zone names to canonical IANA zones; CLDR changes are rare renames/additions. Unknown names fall back to the existing warning rather than guessing.
- [Mapping `birthday` changes previously-warned events into materialized Resources] → Intended; sync manifests reconcile on the next run, and the warning code itself remains valid for other variants.
- [Local wall-time→instant conversion via `Intl` offset computation can be off across DST transitions] → The computation re-derives the offset at the candidate instant and iterates once, which is exact for all real zone offsets except the ambiguous/skipped local hour, where Graph itself supplies UTC datetimes in practice (sync requests `outlook.timezone="UTC"`); failure still degrades to the existing warning, never a wrong silent value.

## Migration Plan

None. Pre-alpha: existing local databases are disposable. Recovery for previously-skipped calendar events and mutable-id mailbox Refs is purge and re-sync/re-search.

## Open Questions

- Whether live Graph `$search` honors the immutable-id preference on result pages — answerable only at the next credentialed smoke test; tracked in the risk above.
