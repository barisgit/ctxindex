# packages/adapters/src/microsoft/calendar/

## Responsibility

Implements the indexed, read-only `microsoft.calendar@1` Adapter for synchronizing and retrieving events from one selected Microsoft Graph calendar as `calendar.event@1` resources.

## Design/patterns

- `config.ts` defines strict Source configuration: `calendar_id` defaults to `default`, while positive `past_days` and `future_days` bound the rolling sync window.
- `definition.ts` binds shared Microsoft OAuth with `Calendars.Read`, Graph host authority, the calendar-event Profile, indexed routing, and `sync`/`retrieve` operations; it exposes no Actions.
- `event.ts` validates permissive Graph event DTOs and normalizes timing, all-day dates, participants, response/status, recurrence, links, locations, HTML/plain-text descriptions, timestamps, immutable event Refs, removals, and warning-bearing malformed records into the provider-neutral calendar schema.
- `response.ts` validates Graph pages and progression invariants, constrains opaque next/delta links through the provider-root transport, translates expired delta state, and rejects malformed responses.
- `sync.ts` uses a fingerprinted rolling-window cursor and sorted event manifest. The default calendar follows `calendarView/delta`; selected calendars use bounded `calendarView` scans. Reconciliation emits upserts/removals/warnings and checkpoints, while expired delta links trigger one warned full reconciliation.
- `retrieve.ts` strictly parses a Source-scoped event Ref, fetches the configured calendar event with immutable-ID/UTC preferences, validates identity and completeness, logs normalization warnings, and emits the resource.

## Data & control flow

1. Built-in registration exposes the Adapter and core parses Source configuration before dispatching an authenticated sync or retrieve context.
2. Sync derives the anchored window, validates cursor/config continuity, and pages Graph through shared `../transport.ts`; page responses pass through `response.ts` and each item through `event.ts`.
3. The operation emits normalized event upserts, cancellation/removal tombstones, bounded warnings, and a checkpoint containing strategy-specific continuation state plus the deterministic manifest. Invalid cursors/windows and expired deltas reconcile once from the current window.
4. Retrieve validates `ctx://<SOURCE>/event/<encoded-id>`, requests the exact event, normalizes it through the same event path, and emits a complete resource.

## Integration points

- Registered by `packages/adapters/src/builtins.ts` and exported with its config schema through `packages/adapters/src/index.ts`.
- Depends on `@ctxindex/core/errors`, `@ctxindex/extension-sdk`, `@ctxindex/profiles`, Zod, LinkeDOM, shared `microsoftOAuthProvider`, and provider-root Microsoft Graph transport.
- External boundary: Microsoft Graph v1.0 calendar and calendar-view endpoints on `graph.microsoft.com`; tests may route through the constrained loopback Graph mock.
