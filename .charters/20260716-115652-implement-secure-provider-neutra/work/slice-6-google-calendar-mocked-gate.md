# Slice 6 Google Calendar mocked gate

Date: 2026-07-16
Base: `b2a0313 feat: add provider-neutral calendar profile`
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 6.1–6.7 only; Human checkpoint 6.8 remains pending.

## Observable result

- `google.calendar@1` is a bundled indexed, read-only Adapter for exactly one configured calendar and `calendar.event@1`.
- One Google authorization selecting mailbox and calendar Adapters creates one Account and one exact compatible Grant, then binds named mailbox and calendar Sources in exact Realms.
- Full and incremental Calendar sync, paging, stable Source-scoped retrieval, cancellations, diff rollback, HTTP 410 recovery, config/month/resync window reconciliation, malformed-input safety, and deterministic checkpointing pass without live traffic.
- Calendar exposes only `calendar.events.readonly`, no Actions, and no write routes. Calendar requests never reach Gmail endpoints; malformed/foreign Refs perform zero provider I/O.

## Focused proof

- `bun test packages/adapters/src/google-calendar` — Passed, 38 tests / 0 failures.
- `bun test --path-ignore-patterns '__none__' google-calendar-workflow.e2e.test` — Passed, 1 test / 76 assertions. The real binary proved one Account/Grant, exact five stored scopes, three named Sources, exact Realm filtering, account/source inventory, initial and unchanged sync, update/add/delete, diff rollback, rolling-window absence reconciliation, cached search/get, GET-only Calendar traffic, no Gmail cross-service traffic, and unknown Calendar Action zero I/O.
- `bun test --path-ignore-patterns '__none__' calendar-event-profile.integration.test` — Passed.
- Hardening added during parent review: all-day events omit `occurredAt`; an event without a usable provider id aborts before any emission/checkpoint; HTTP 410 is treated as sync-token invalidation only in events-list sync, not retrieval.

## Repository gates

- `bash scripts/verify/full-test-suite.sh` — Passed, 862 tests / 0 failures, sequential with forced file-backed Keychain mock. The discovery guard now requires every Adapter test file, including Google Calendar.
- `bun run test:e2e` — Passed, 59 tests / 0 failures / 826 assertions.
- `bun run test:integration` — Passed.
- `bun run build` — Passed.
- `bun run typecheck` — Passed.
- `bun run lint` — Passed.
- `bun test scripts/verify/module-architecture.test.ts` — Passed.
- `bun run scripts/verify/package-dependencies.ts` — Passed.
- `bash scripts/verify/network-egress.sh` — Passed.
- `bun run scripts/verify/no-prompts-static.ts` — Passed.
- `bash scripts/spikes/d3-compiled-extension/run.sh` — Passed.
- `openspec validate multi-provider-context-access --strict` — Passed.
- `openspec validate --all --strict` — Passed.
- `git diff --check` — Passed.
- Incremental cartography updated the new Adapter hierarchy and reports `No changes detected` across 233 tracked production/config files.
- Final `bun run ci` — Passed all gates in 77 seconds, including frozen install, build, compiled/relocated Extensions and skills, architecture, type/lint, D3, and the 862-test full suite.
- Explicit future architecture contract: `bun test ./scripts/verify/multi-provider-architecture.red.ts` produced the expected next-slice baseline, 1 pass / 1 failure: only missing `microsoft/{mailbox,calendar}` remains red; the no-send assertion passes.

An initial parallel full-suite attempt surfaced two real registry/guidance fixture drifts and resource-contention timeouts. The fixed registry count and derive-don't-duplicate guidance test pass; the settled sequential e2e and full-suite runs above are green.

## Independent review

- Standards/security review `4a0d20d3-8434-4073-8982-0eca5ced6661`: approved, 0 critical / 0 important. It confirmed bounded egress, read-only scope/routes, Ref confinement, one-retry Grant path, cursor safety, no secret output, and adequate mocked coverage.
- Specification/API review `5c219863-69f5-4da5-aff0-0de871ae22ff`: approved, 0 critical / 0 important. It confirmed Google parameter compatibility, final-token checkpointing, one newly anchored 410 reconciliation, manifest/no-guessed-delete behavior, Calendar Profile semantics, exact scopes/Realms, and zero mutation surface.

Nonblocking review notes were either simplified (duplicate event text normalization) or intentionally retained: full/incremental collectors stay explicit, and preserving unsupported usable ids can cause harmless no-op removals tolerated by the generic coordinator.

## Safety boundary

No real Google endpoint, browser, `.env`, native Keychain, or private credential was accessed. All OAuth/API values were synthetic loopback fixtures; recorded authorization values were redacted. Task 6.8 must prepare fresh ignored isolated state and pause for explicit user approval before any live login/consent/read.
