## Why

The first live multi-provider sync (2026-07-17) surfaced three systematic real-world calendar data shapes that the strict adapters skip: Google `birthday`-variant events (9 errors on one personal calendar), Microsoft Calendar events rejected as malformed (43 skips on one Outlook.com work calendar — a volume suggesting one systematic schema mismatch rather than genuinely broken data), and Graph occurrence starts whose provider time zone cannot be resolved (series identity omitted). All degrade gracefully today, but they silently exclude real events from the local index.

## What Changes

- Support the Google Calendar `birthday` event variant (and sibling special variants such as `fromGma il`/`workingLocation` as evidence dictates) in `google.calendar` mapping to `calendar.event@1`, or explicitly classify them as intentionally unindexed with a documented reason.
- Diagnose the dominant `microsoft_calendar_malformed_event` rejection shape from a sampled live event, then relax or extend the Microsoft Calendar mapping so structurally valid real-world Outlook.com events materialize.
- Resolve Microsoft occurrence-start provider time zones for the common Windows time zone names so recurring series identity is preserved instead of omitted.
- Keep warnings for genuinely unmappable events; warning codes remain stable.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `google-calendar-adapter`: mapping coverage for the `birthday` event variant (or an explicit documented exclusion requirement).
- `microsoft-graph-adapters`: malformed-event mapping coverage and Windows-time-zone resolution for occurrence starts/series identity.
- `calendar-context`: only if variant coverage requires new Profile-level requirements (expected unchanged; the Profile already models all-day and series linkage).

## Impact

- `packages/adapters` Google/Microsoft calendar sync mapping and their unit/integration fixtures (new fixtures cloned from redacted live shapes).
- No storage, core, CLI, auth, or Profile schema changes expected.
- Evidence needed before design: one redacted sample of each failing shape, captured via an isolated diagnostic sync or provider `get`.

## Notes

Filed from live smoke-test evidence; diagnosis precedes design per the diagnose-first rule. Symptom inventory:

1. `google_calendar_unsupported_event` — variant `birthday`, recurring series instances (`_20260207` style suffixes), 9 occurrences on one personal calendar.
2. `microsoft_calendar_malformed_event` — 43 skips on one Outlook.com calendar in a single initial sync window; ids share one mailbox prefix, suggesting one recurring generator (likely one property shape).
3. `microsoft_calendar_unresolved_series_start` — provider time zone unresolvable on occurrence starts; series identity omitted but events materialized.
