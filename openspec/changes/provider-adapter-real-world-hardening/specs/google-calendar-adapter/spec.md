## MODIFIED Requirements

### Requirement: Google Calendar normalization preserves event semantics
The Adapter SHALL normalize timed/all-day values, status, organizer, attendees, recurrence instance/series identity, visibility-safe text, and updated timestamps without treating HTML as trusted text. The `birthday` event variant SHALL be normalized as a standard all-day event with series linkage derived from its recurring-event identity, ignoring `birthdayProperties`. The `fromGmail` and `workingLocation` variants (and any other non-`default` variant) SHALL remain intentionally unindexed with the stable `google_calendar_unsupported_event` warning: `fromGmail` duplicates Gmail-derived context whose source of truth is the mailbox, and `workingLocation` carries presence metadata outside the calendar-event vocabulary. Unsupported event variants and malformed events SHALL yield bounded warnings or safe optional omissions rather than malformed Resources.

#### Scenario: Recurring instance is synchronized
- **WHEN** Google returns an expanded recurring occurrence with a recurring-event identity and original start
- **THEN** ctxindex emits a distinct stable occurrence Resource and a Profile-declared series Relation when its target can be formed

#### Scenario: All-day event crosses multiple dates
- **WHEN** Google returns date-only start and exclusive end values
- **THEN** the normalized payload retains the same half-open date range

#### Scenario: Birthday variant is synchronized
- **WHEN** Google returns an `eventType: birthday` recurring instance with date-only timing, a recurring-event identity, and `birthdayProperties`
- **THEN** ctxindex materializes it as a normal all-day `calendar.event@1` Resource with series linkage from the recurring-event identity and without any `birthdayProperties`-derived payload

#### Scenario: Working-location variant stays excluded
- **WHEN** Google returns an `eventType: workingLocation` or `eventType: fromGmail` event
- **THEN** the event is skipped with the stable `google_calendar_unsupported_event` warning and no Resource is emitted
