## 1. Private replay checkpoint (Slice: demonstrated live bypass before behavior changes)

- [x] 1.1 Human checkpoint: in a private agent/session with approved Microsoft access, follow `private-replay-checkpoint.md` to capture one minimal redacted occurrence shape that currently emits `microsoft_calendar_unresolved_series_start`; do not transfer credentials, raw ids, user content, global state, or operator artifacts
- [x] 1.2 Add the privately validated redacted fixture to the Microsoft Calendar normalization tests and prove it fails on the unmodified production normalizer by omitting `payload.series` and emitting the stable warning
- [x] 1.3 Record the exact structural bypass and selected smallest correction in `design.md`, resolving its replay-dependent open questions before editing production behavior

## 2. Calendar Profile canonical zones (Slice: provider-neutral typed vocabulary)

- [x] 2.1 Add focused `calendar.event@1` Profile tests for optional `startTimeZone` and `endTimeZone` string field projections on timed events and their omission on all-day events
- [x] 2.2 Implement the two declarative typed field projections without changing the payload union or adding provider/core dependencies
- [x] 2.3 Slice gate: run `bun test packages/profiles/src/calendar-event.test.ts scripts/verify/calendar-event-profile.integration.test.ts`

## 3. Microsoft series replay fix (Slice: valid series survives, invalid starts still warn)

- [x] 3.1 Extend the failing replay test with the expected exact `series.providerEventId`, canonical same-Source `series.ref`, correct `series.originalStart`, and canonical timed payload zones
- [x] 3.2 Add/strengthen mixed Microsoft Calendar fixtures for Windows and IANA zones, explicit UTC/offset original starts, all-day occurrences, unknown required zones, nonexistent DST-gap local times, null/absent optional fields, and malformed input; valid cases retain series without warnings and only genuinely unrepresentable cases emit `microsoft_calendar_unresolved_series_start`
- [x] 3.3 Recognize Graph event type and use current start only for an unmodified `occurrence` whose `originalStart` is omitted; canonicalize Microsoft event start/end zone labels through the existing resolver without applying the fallback to exceptions or adding provider I/O
- [x] 3.4 Verify Sync and Retrieve continue to share normalization, stable Source-scoped ids, transactional cursor behavior, and bounded warnings
- [x] 3.5 Slice gate: run `bun test packages/adapters/src/microsoft/calendar packages/profiles/src/calendar-event.test.ts scripts/verify/calendar-event-profile.integration.test.ts`

## 4. Compiled and private live verification (Slice: packaged replay and actual resync)

- [x] 4.1 Extend the compiled mixed-provider calendar replay/workflow with synthetic Microsoft valid Windows/IANA occurrences plus unknown-zone and DST-gap cases, asserting Profile field vocabulary and series relations without any live data
- [x] 4.2 Compiled slice gate: run `bun test src/e2e/multi-provider-calendar-workflow.e2e.test.ts src/e2e/compiled-extension.e2e.test.ts` from `apps/cli`
- [ ] 4.3 Human checkpoint: in the private approved provider lane with isolated ctxindex state, perform a full Microsoft Calendar resync and report redacted counts proving valid recurring occurrences carry series identity, `microsoft_calendar_malformed_event` remains zero for the tested source, and only genuinely invalid series starts warn

## 5. Doctrine and final verification

- [x] 5.1 Promote the applicable Profile typed-zone doctrine and shared Google/Microsoft canonical-zone normalization boundaries into their named implementation sidecars
- [x] 5.2 Refresh affected `codemap.md` files through the `cartography` skill if the implementation changes structural file responsibilities (no structural file responsibility changed)
- [x] 5.3 Run `bun run ci` and `bunx openspec validate --all --strict`
- [x] 5.4 Run `openspec-verify-change` and resolve every non-Human implementation/spec/doctrine finding before archive
