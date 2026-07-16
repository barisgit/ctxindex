# Slice 9 Microsoft Calendar gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 9.1–9.6; loopback Google and Microsoft fixtures only, with no live Microsoft traffic, private credential access, or provider mutation.

## Result

Passed. `microsoft.calendar@1` is a provider-owned, read-only indexed Adapter for one default or explicit Microsoft calendar and a positive rolling window.

- The default calendar uses stable Graph v1.0 `/me/calendarView/delta`, buffers every page before emission, copies confined opaque next/delta links verbatim, checkpoints only the final delta link plus a sorted manifest, and performs one newly anchored full reconciliation after invalid or expired state.
- Explicit calendars use stable Graph v1.0 `/me/calendars/{id}/calendarView` complete paged scans with manifest reconciliation and no beta delta cursor.
- Both strategies retain their prior checkpoint on cancellation, partial failure, repeated/foreign links, malformed pages, or events without usable ids. Tombstones arise only from `@removed` or absence after a complete scan/reconciliation.
- Event normalization preserves immutable provider ids, timed versus all-day intervals, original provider zones, organizer/attendees/status, exact representable recurrence, Source-scoped series Refs, safe provider links, and deterministic warnings. Complete cancelled events remain `status: cancelled` resources; unsupported Windows-zone all-day occurrence dates warn instead of being guessed.
- Retrieval accepts only an exact canonical same-Source Ref, confines default/named calendar routes and host before I/O, sends immutable-id and UTC response preferences, verifies the returned id, and emits one complete `calendar.event@1` Resource.
- The Adapter requests only `Calendars.Read`, declares only `graph.microsoft.com`, exposes sync/retrieve with zero Actions, and contains no beta or calendar write route.
- Stateful Graph fixtures cover default delta paging/change/expiry, named scans/retrieval, window filtering, and GET-only enforcement.
- The compiled cross-provider workflow proves one Google and one Microsoft Account/Grant, named personal Google and work Microsoft Sources, exact Realm filtering, Source-isolated overlapping event ids, search/get, update/add/delete/window behavior, read-only scopes/routes, and unknown calendar Action zero I/O.

## Corrections found during verification

1. The first compiled Graph run exposed a real URL composition bug: Calendar paths already included `/v1.0` while the shared Graph base also owned it, yielding `/v1.0/v1.0/...`. The provider-root `graphUrl` now normalizes either provider-relative or v1-prefixed internal paths, and Calendar tests assert exact pathnames.
2. Recurrence normalization now preserves relative monthly/yearly ordinals exactly, rejects recurrence forms it cannot represent without approximation, and warns deterministically when recurrence is omitted.
3. Graph `originalStart` is a UTC instant. All-day occurrence dates are now converted through a resolvable provider time zone; unsupported Windows-zone names produce an explicit warning rather than a fabricated date. Timed and all-day series identities have focused coverage.
4. Cancelled Graph events were initially treated as tombstones in sync while retrieval returned a cancelled resource. Sync and retrieval now agree: only `@removed` is a tombstone, while a complete `isCancelled` event is upserted with `status: cancelled` and retained in the manifest.
5. Delta expiry matching now accepts documented `SyncStateNotFound` casing and `resyncRequired`, case-insensitively, in addition to unconditional HTTP 410 handling.
6. The final Microsoft provider architecture assertions graduated into the normal architecture suite and the exhausted intentionally-red file was removed.
7. Parallel full-suite load exposed the Gmail Draft compiled test's default five-second timeout; it now uses the same bounded 30-second timeout as the other compiled provider workflows. Its focused behavior remained green.

## Verification

Focused and compiled workflows:

- `bun test packages/adapters/src/microsoft/calendar` — passed (23 tests).
- `bun test packages/adapters/src/microsoft` — passed.
- `bun test apps/cli/src/e2e/_mock-graph.test.ts` — passed (4 tests, 23 assertions).
- `bun test --path-ignore-patterns '__none__' multi-provider-calendar-workflow` — passed (52 assertions).
- `bun test packages/adapters/src/google-calendar` — passed.
- `bun test packages/profiles/src/calendar-event.test.ts scripts/verify/calendar-event-profile.integration.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' gmail-draft-action` — passed after timeout hardening.

Static, architecture, and specification:

- `bun run typecheck` — passed.
- `bunx biome check .` — passed.
- `bun test scripts/verify/architecture-lint.test.ts scripts/verify/module-architecture.test.ts scripts/verify/dependency-rules.test.ts` — passed.
- `bun test --path-ignore-patterns '__none__' network-egress` — passed.
- `openspec validate multi-provider-context-access --strict` — passed.
- `openspec validate --all --strict` — passed.
- `git diff --check` — passed.

Final project gate:

- `bun run ci` — passed all 12 gates in 143 seconds: frozen install, lint, typecheck, build, package dependencies, architecture lint, CLI business-logic/framework/line gates, exports map, D3 compiled extension, and the complete unit/integration/e2e suite.

## Independent review

- Security/specification review `ea2c0cf1-4efa-4ea7-8d51-15f8592cf98d`: approved with 0 critical and 0 important findings.
- Graph delta/window/time-semantics review `903298a5-872f-4f74-b7c0-3550707f4941`: identified three important normalization/expiry findings; after correction and focused rerun, explicitly approved with no remaining critical or important findings.

## Remaining work

Slice 10 owns the relocated all-product compiled workflow, stronger recursive network/redaction/security gates, generated guidance/package/codemap updates, and the mandatory live Microsoft mail/calendar/Draft Human checkpoint. No live provider traffic or provider mutation occurred in this Slice 9 gate.
