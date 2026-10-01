# Private replay checkpoint

This checkpoint supplies the missing structural evidence for GitHub issue #8 without exposing live provider data to the shared development session. Run it only in a private agent/session that already has approved Microsoft access. The private agent may use the configured ctxindex Source/authentication as an opaque capability for this bounded read, but must not reveal or directly inspect credentials/tokens, copy global state, inspect unrelated events, or transfer `.operator-artifacts` into this worktree.

## Objective

Produce one minimal, synthetic-redacted JSON object that still reproduces the current `normalizeMicrosoftCalendarEvent` result:

- the event materializes;
- `payload.series` is absent; and
- warning code `microsoft_calendar_unresolved_series_start` is present.

The transferred fixture must preserve the failing property's JSON shape and date-time/zone syntax, not the real user's content or identifiers.

## Private procedure

1. Prefer isolated temporary XDG/ctxindex state when the approved private environment can bind it to the configured Account without exposing secrets. Otherwise use the already-configured Source read-only and do not alter, export, delete, or purge the user's normal ctxindex database. A new sync/resync or any other state change requires its own explicit Human checkpoint.
2. Select one event already counted under `microsoft_calendar_unresolved_series_start`. Inspect only the fields required by the current normalizer and schema; do not collect the whole response when a projection/local diagnostic can avoid it.
3. Retain only these property names when present: `type`, `id`, `isAllDay`, `start`, `end`, `originalStart`, `originalStartTimeZone`, `originalEndTimeZone`, `seriesMasterId`, `recurrence`, `isCancelled`, `showAs`, `createdDateTime`, and `lastModifiedDateTime`. If an unexpected property's presence proves necessary to reproduce the branch, name it and explain why before including it.
4. Replace the occurrence id with `REDACTED_OCCURRENCE_ID` and the series id with `REDACTED_SERIES_ID`. Preserve only whether they are non-empty strings and whether two fields are equal/distinct; never preserve length, prefix, suffix, alphabet, or encoded fragments from the real ids.
5. Remove `subject`, body/bodyPreview, organizer, attendees, location, webLink, calendar/account/source labels, emails, names, descriptions, and every passthrough property not required by step 3.
6. Replace timestamps with nearby synthetic dates while preserving all characteristics relevant to parsing: JSON type, fractional-second precision, `Z`/numeric-offset/no-offset form, date-only versus date-time form, zone label, relative ordering, all-day midnight form, and whether the local wall time is normal/ambiguous/nonexistent. Keep duration and recurrence relationships only if changing them stops reproduction.
7. Run the redacted object directly through the unmodified `normalizeMicrosoftCalendarEvent` using a synthetic uppercase Source ULID and synthetic calendar id. Confirm the three objective assertions still hold. If they do not, iteratively restore only structural characteristics, never user content or real identifier material.
8. As a diagnostic only in the private session, report which current branch failed: DTO parse, zone resolution, `originalStart` instant/date conversion, or final Profile validation. Do not propose a fallback that fabricates a missing provider field.

## Return to the shared implementation lane

Return only:

- the minimal redacted JSON fixture that was replay-confirmed against the unmodified normalizer;
- the three assertion results (materialized, series absent, warning present);
- the failing branch and a concise structural cause, such as the exact `originalStart` JSON type/syntax and zone-resolution outcome;
- whether `type`, `seriesMasterId`, and `originalStart` were present and their JSON types;
- whether the original start carried `Z`, a numeric offset, no offset, or a nested date-time object;
- whether `originalStartTimeZone`, `start.timeZone`, and `end.timeZone` resolved through the existing resolver, reported as synthetic/raw labels only if already non-identifying standard zone names;
- the smallest behavior correction the replay demonstrates, plus any residual provider-shape uncertainty.

Do not return raw payloads, real ids, hashes of ids, titles/content, people, URLs, account/calendar/source labels, credentials, paths to private evidence, or screenshots.

## Acceptance for unblocking production edits

The shared lane may proceed only when the transferred redacted fixture reproduces the failure unchanged and contains enough structural information to identify a single normalization bypass. If redaction prevents reproduction, keep the work private and report the missing structural category rather than transferring raw data.
