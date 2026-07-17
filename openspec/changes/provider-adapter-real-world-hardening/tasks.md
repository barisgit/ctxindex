## 1. Microsoft Calendar null tolerance (Slice: fixture-verified null-capable schema)

- [x] 1.1 Add a null-as-absent helper in `packages/adapters/src/microsoft/calendar/event.ts` and apply it to every optional field Graph can null (`subject`, `body`, `bodyPreview`, `location`, `location.displayName`, `start`, `end`, `isAllDay`, `originalStartTimeZone`, `originalEndTimeZone`, `organizer`, `attendees`, `isCancelled`, `showAs`, `seriesMasterId`, `originalStart`, `webLink`, `createdDateTime`, `lastModifiedDateTime`, nested `emailAddress.name`/`address`, attendee `status`)
- [x] 1.2 Add a regression test in `event.test.ts` with a fixture cloned from the evidence shape (`singleInstance`, `seriesMasterId: null`, `recurrence: null`, `occurrenceId: null`, `originalStartTimeZone: "Greenwich Standard Time"`, UTC start/end) asserting it materializes with zero warnings
- [x] 1.3 Slice gate: `bun test packages/adapters/src/microsoft/calendar` passes

## 2. Google Calendar birthday variant (Slice: birthday maps, siblings stay excluded)

- [x] 2.1 In `packages/adapters/src/google-calendar/event.ts`, treat `eventType: "birthday"` like `default` (normal all-day mapping, series linkage from `recurringEventId`, `birthdayProperties` ignored); keep `google_calendar_unsupported_event` for all other non-`default` variants
- [x] 2.2 Update `event.test.ts`: add a birthday fixture cloned from the evidence shape (all-day recurring instance with `recurringEventId`, `originalStartTime`, `birthdayProperties`) asserting a normal all-day Resource with series linkage; assert `fromGmail`/`workingLocation` still warn with the stable code
- [x] 2.3 Update the `sync.test.ts` unsupported-variant fixture so the excluded variant is a non-birthday one and manifests stay correct
- [x] 2.4 Slice gate: `bun test packages/adapters/src/google-calendar` passes

## 3. Microsoft occurrence-start time zone resolution (Slice: dual-name resolution preserves series identity)

- [x] 3.1 Add `packages/adapters/src/microsoft/calendar/windows-zones.ts` with the CLDR windowsZones territory-001 Windows-to-IANA table and a `resolveTimeZone` helper (IANA probe via `Intl`, then Windows table, else undefined)
- [x] 3.2 Wire the resolver into occurrence-start resolution in `event.ts` for both the all-day path (`dateInTimeZone`) and the timed path (offset-less `originalStart` instants), keeping the stable `microsoft_calendar_unresolved_series_start` warning for unresolvable names
- [x] 3.3 Add tests: Windows-name all-day occurrence resolves series identity (flip the existing `Pacific Standard Time` warning fixture into a resolving case plus a genuinely-unknown-zone warning case); timed occurrence with Windows `originalStartTimeZone` resolves; IANA names keep working
- [x] 3.4 Slice gate: `bun test packages/adapters/src/microsoft/calendar` passes and `scripts/spikes/d3-compiled-extension/run.sh` stays green

## 4. Microsoft mailbox immutable-id search preference (Slice: header proven per page)

- [x] 4.1 Pass `IMMUTABLE_ID_PREFERENCE` explicitly in `packages/adapters/src/microsoft/mailbox/search-remote.ts` page fetches instead of relying on the `graphHeaders()` default
- [x] 4.2 Strengthen `search-remote.test.ts` to assert the exact `Prefer: IdType="ImmutableId"` header (imported constant) on every page of a multi-page search, and confirm draft create/update tests already assert immutable-id preference on requests
- [x] 4.3 Slice gate: `bun test packages/adapters/src/microsoft/mailbox` passes

## 5. Final gate

- [x] 5.1 Run `bun run ci` and fix any findings
