# Slice 5 — provider-neutral Calendar Profile gate

Date: 2026-07-16
Change: `multi-provider-context-access`
Scope: OpenSpec tasks 5.1–5.4

## Observed behavior

- `calendar.event@1` strictly distinguishes ordered RFC 3339 timed intervals from half-open ISO all-day date ranges. All-day events retain local dates and project no synthetic `occurredAt` or UTC-midnight instant.
- The payload carries stable provider, calendar, and event identity; normalized status; title/description/location; organizer and attendees; recurrence rules or occurrence-to-series metadata; provider URL; and created/updated timestamps through provider-neutral fields.
- Event Refs are exactly `ctx://<UPPERCASE-source-id>/event/<encodeURIComponent(entire-case-sensitive-opaque-id)>`. The Profile uses Adapter-composed exact series Refs, so equal provider series ids in overlapping Sources resolve only within their own Source copy.
- Pure Profile projections provide title, bounded summary, bounded deterministic chunks, common typed fields, timed occurrence ordering, alias `events`, documentation, and a `series` Relation. The Profile declares no Actions, Artifacts, or special exports; deterministic generic JSON remains available.
- The generic Profile API now supports an optional summary projection. `ResourceStore` materializes it without Calendar branching, and dynamic Profile registry validation rejects a non-function summary declaration.
- `calendar.event@1` is publicly exported by `@ctxindex/profiles`, bundled declaratively, and visible through ordinary registry description. Core production sources contain no Calendar vocabulary branch.
- Generic integration proves matching fake Google/Microsoft events search together, exact Realm and typed-provider filtering, overlapping Sources remain distinct, absent complete Resources retrieve and cache through the owning fake Adapter, and subsequent get is a cache hit.

## Red-to-green evidence

- `packages/profiles/src/calendar-event.test.ts` initially failed because `./calendar-event` did not exist.
- The generic ResourceStore summary test initially retained the envelope fallback rather than the Profile projection.
- Implementation made both contracts green before registration and generic integration work proceeded.

## Gate results

Passed:

- `bun test packages/profiles/src`
- `bun test packages/extension-sdk/src packages/core/src/resource/resource-store.test.ts packages/core/src/registry/profile-registry.test.ts`
- `bun test packages/adapters/src/builtins.test.ts`
- `bun test --path-ignore-patterns '__none__' ./scripts/verify/calendar-event-profile.integration.test.ts`: 3 passed, 0 failed, 14 assertions.
- Full ordinary unit suite with forced file-backed test Keychain: 748 passed, 0 failed, 2,401 assertions across 112 files.
- `bun run typecheck`
- `bun run lint`
- `bun test scripts/verify/module-architecture.test.ts scripts/verify/package-dependencies.test.ts`
- `bun scripts/verify/package-dependencies.ts`
- Explicit future-slice red contract: the no-send assertion passes and exactly one expected Adapter-module assertion remains red.
- `openspec validate --all --strict`: 10 passed, 0 failed.
- `git diff --check`

No live provider traffic, credential access, or native Keychain operation occurred.

## Independent review

- Profile semantics review `fa041fb0-5a40-49ec-8bd7-859f036c23cc`: approved with 0 critical and 0 important findings. It verified timed/all-day semantics, no invented all-day instant, exact Ref encoding, same-Source series resolution, bounded projections, provider portability, summary fallback, and the no-Action/no-export boundary. After the final registry-summary guard and removal of arbitrary payload array caps, the reviewer resumed and confirmed the same verdict.
- Architecture/standards review `4a1e0f72-e251-4ebd-9d57-a4879ab2e6f5`: approved with 0 critical and 0 important findings. It verified the generic SDK/core summary extension, no Calendar branch in core, package/builtin registration, generic storage/search/get/Realm coverage, dependency direction, deterministic behavior, and correct red-contract graduation.

## Remaining boundary

This gate does not claim provider transport, calendar synchronization, rolling-window cursors, or live consent. The next mandatory slice owns `google-calendar`; its stateful mocked sync/retrieve proof must pass before the explicit Google Human checkpoint.
