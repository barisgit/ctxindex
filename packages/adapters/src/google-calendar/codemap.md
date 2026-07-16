# packages/adapters/src/google-calendar/

## Responsibility

Owns the read-only indexed `google.calendar@1` Source Adapter for one explicitly selected Google calendar, translating Calendar API events into complete provider-neutral `calendar.event@1` Resources.

## Design

- `definition.ts` declares the Adapter, shared Google OAuth identity, narrow events-read scope, API host, strict generated config, indexed sync/retrieve capabilities, and zero Actions.
- `config.ts` defaults one calendar id plus positive past/future coverage days. `url.ts` selects the production Calendar host or an explicit loopback-only nonproduction mock base.
- `response.ts` validates event pages and maps HTTP status to stable provider errors; sync-token invalidation remains a private control signal used only by list sync.
- `event.ts` validates Google event variants, strips markup to visibility-safe text, normalizes timed/all-day/participant/recurrence/provider metadata, emits exact Source-scoped event and series Refs, and returns bounded deterministic warnings for safely skippable variants.
- `sync.ts` uses an explicit versioned cursor containing effective-config fingerprint, UTC anchor/month, half-open window, opaque sync token, and code-point-sorted manifest. Full and incremental scans buffer all pages before deterministic emissions; only the final token checkpoints. Invalid cursor/token, config/month roll, or resync performs one newly anchored full reconciliation, while uncertain scans never infer deletions.
- `retrieve.ts` accepts only the canonical same-Source event Ref, fetches inside the selected calendar, validates provider identity, and emits one complete Resource.

## Data and control flow

1. Source creation validates and stores one effective calendar selection and rolling-window config against a compatible Google Grant.
2. Initial sync requests expanded instances with deleted visibility inside a newly anchored window, normalizes the final event state, reconciles only trusted prior manifest ids, and checkpoints the final sync token/manifest after emissions.
3. Incremental sync sends only token-compatible shaping parameters, applies explicit cancellations/changes, preserves usable ids for unsupported variants, and advances after complete paging. HTTP 410 discards partial changes and retries exactly one full scan.
4. Generic core storage validates emitted Profile payloads and atomically applies candidates/checkpoint; diff mode is rolled back by the coordinator. Search/get then use generic local projections, with retrieve available for absent canonical Refs.

## Integration

- Registered by `packages/adapters/src/builtins.ts` and re-exported through `packages/adapters/src/index.ts`.
- Uses `@ctxindex/extension-sdk` sync/retrieve contexts, `@ctxindex/profiles` Calendar schema/Ref helpers, and core config/error seams; provider access is mediated by the generic linked-Grant provider context and global egress gate.
- External endpoint: `https://www.googleapis.com/calendar/v3`; production code contains no POST/PATCH/PUT/DELETE route or Calendar mutation scope.
