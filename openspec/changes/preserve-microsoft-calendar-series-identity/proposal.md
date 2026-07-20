## Why

A full Microsoft Calendar resync now materializes real Outlook.com events after the null-tolerance fix, but recurring occurrences still lose their `calendar.event@1` series linkage. In the observed run, 26 occurrences emitted `microsoft_calendar_unresolved_series_start` and none of the 43 materialized events carried `payload.series`, even though Microsoft Graph exposed a recurring-series identity and a recognized Windows time-zone name. The existing documented-shape fixtures for Windows zones, IANA zones, and DST behavior already pass, so a redacted replay fixture from one affected occurrence is required before changing normalization behavior.

## What Changes

- Preserve the Graph series-master identity, canonical same-Source series Ref, and correct original occurrence start for valid Microsoft recurring occurrences returned by calendar-view sync.
- Normalize Microsoft timed-event time-zone vocabulary to canonical IANA names and expose that canonical value through the provider-neutral Calendar Event Profile's typed fields.
- Keep `microsoft_calendar_unresolved_series_start` only when a recurring member's series start genuinely cannot be represented, including exceptions missing their original start, unknown zones, and nonexistent local times; use current start only when Graph explicitly classifies the event as an unmodified occurrence.
- Require a redacted replay fixture captured before production behavior changes, then cover the replay and mixed Windows/IANA/unknown-zone/DST cases in focused and compiled tests.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `calendar-context`: require canonical IANA time-zone vocabulary for timed Calendar Events and expose it through generic typed search fields while retaining Source-scoped occurrence/series identity.
- `google-calendar-adapter`: normalize provider time-zone aliases through the Profile-owned canonicalizer before strict Calendar Event validation.
- `microsoft-graph-adapters`: preserve recurring-occurrence series identity and canonical time-zone semantics for valid Microsoft Calendar calendar-view payloads, warning only for genuinely unrepresentable series starts.

## Impact

- `packages/profiles`: Calendar Event schema/projections and focused Profile tests.
- `packages/adapters`: Microsoft Calendar series normalization plus Google/Microsoft canonical time-zone normalization and focused tests.
- Compiled multi-provider calendar verification and one isolated private live resync checkpoint.
- No new dependency, provider scope, provider mutation, core/storage branch, recurrence expansion, mailbox behavior, migration, credential handling, or live fixture in the shared workspace.
