# Diagnosis evidence (captured live 2026-07-17 from the smoke-test account, redacted)

All four symptoms were reproduced against live providers with the real adapter code before this change was designed. Root causes are CONFIRMED, not hypothesized.

## 1. microsoft_calendar_malformed_event (43 skips) — ROOT CAUSE CONFIRMED

Graph returns explicit `null` for absent optional fields; the adapter schema uses zod `.optional()` which rejects `null`.

Live repro: fetching a rejected event and running `microsoftCalendarEventSchema.safeParse` yields exactly:

```json
[{ "expected": "string", "code": "invalid_type", "path": ["seriesMasterId"], "message": "Invalid input: expected string, received null" }]
```

Sample event shape (redacted): `type: singleInstance`, `isAllDay: false`, `start/end` as `{dateTime: "2025-09-11T08:00:00.0000000", timeZone: "UTC"}`, `seriesMasterId: null`, `recurrence: null`, `occurrenceId: null`, `originalStartTimeZone: "Greenwich Standard Time"` (another event: `"Europe/Belgrade"` — Graph mixes Windows and IANA names).

Fix shape: make nullable every field Graph can null (`seriesMasterId`, `recurrence`, and audit siblings — use `.nullish()` semantics; treat `null` as absent). Add a fixture cloned from this shape.

## 2. google_calendar_unsupported_event variant birthday (9 skips)

Live payload (redacted): `eventType: "birthday"`, `status: "confirmed"`, `start: {date: "2026-02-07"}`, `end: {date: "2026-02-08"}`, `recurringEventId: "4rhj7ttiai2rj77s7n6258p3u8"`, `originalStartTime: {date: "2026-02-07"}`, `visibility: "private"`, `transparency: "transparent"`, `birthdayProperties: {contact: "people/…", type: "birthday"}`.

It is a normal all-day recurring instance plus `birthdayProperties`. Map it as a standard all-day `calendar.event@1` with series linkage from `recurringEventId`; `birthdayProperties` needs no Profile change. Decide (and document) whether sibling variants `fromGmail` / `workingLocation` are mapped or explicitly excluded.

## 3. microsoft_calendar_unresolved_series_start

`originalStartTimeZone` carries Windows time zone names (e.g. `"Greenwich Standard Time"`) which the current resolution rejects; note Graph ALSO emits IANA names on some events (`"Europe/Belgrade"` observed live), so resolution must accept both. Add a Windows→IANA mapping (CLDR windowsZones subset or a vetted small dependency) for occurrence-start resolution so series identity is preserved.

## 4. microsoft.mailbox search-remote emits mutable ids in Refs — ROOT CAUSE CONFIRMED IN CODE

`packages/adapters/src/microsoft/mailbox/search-remote.ts` calls `graphHeaders()` WITHOUT `IMMUTABLE_ID_PREFERENCE` (exported by `packages/adapters/src/microsoft/transport.ts`), while `retrieve`/`download`/`draft` and the Ref contract in `ref.ts` all assume immutable ids. Live consequence: `ctxindex get` returned Graph 400 on recent messages whose mutable ids contain URL-hostile characters; refs also go stale when messages move folders.

Fix: pass `IMMUTABLE_ID_PREFERENCE` on all search-remote page fetches; assert the header in tests; verify draft create/update responses also carry immutable ids. Existing materialized mailbox envelopes carry mutable-id refs — pre-alpha, purge/re-search, no migration.
