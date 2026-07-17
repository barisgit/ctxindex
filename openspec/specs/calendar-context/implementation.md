# Calendar Context Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/profiles/src/calendar-event.ts`

```ts
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export function calendarEventRef(
  sourceId: string,
  opaqueEventId: string,
): string;
```

### `packages/adapters/src/google-calendar/event.ts`

```ts
export interface GoogleCalendarWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface NormalizedGoogleCalendarEvent {
  readonly providerEventId?: string
  readonly resource?: SyncedResource
  readonly warnings: readonly GoogleCalendarWarning[]
}

export function normalizeGoogleCalendarEvent(
  input: unknown,
  sourceId: string,
  calendarId: string,
): NormalizedGoogleCalendarEvent;
```

### `packages/adapters/src/microsoft/calendar/event.ts`

```ts
export interface MicrosoftCalendarWarning {
  readonly code: string
  readonly message: string
  readonly ref?: string
}

export interface NormalizedMicrosoftCalendarEvent {
  readonly providerEventId?: string
  readonly removed?: boolean
  readonly cancelled?: boolean
  readonly resource?: SyncedResource
  readonly warnings: readonly MicrosoftCalendarWarning[]
}

export function normalizeMicrosoftCalendarEvent(
  input: unknown,
  sourceId: string,
  calendarId: string,
): NormalizedMicrosoftCalendarEvent;
```

### Definition exports

```ts
// packages/profiles/src/calendar-event.ts
export { calendarEventSchema, calendarEventProfile }
export type { CalendarEvent }

// Adapter definitions
export { googleCalendarAdapterDefinition }
export { microsoftCalendarAdapterDefinition }
```

## Implementation doctrine

`packages/profiles/src/calendar-event.ts` owns provider-neutral event validation and pure projections. Google and Microsoft event modules normalize provider responses and construct Source-scoped Refs; core storage, search, retrieval, and CLI code stay provider-neutral.

Calendar sync uses generic operation contexts. Adapter cursors retain an anchored window, provider cursor, and Source-local manifest; changing the window requires complete reconciliation before cursor replacement or removal emission. Calendar definitions bind no Actions.

## Verification

Profile tests cover timed/all-day validation and deterministic projections. Provider normalization, sync reconciliation, exact retrieval, and `scripts/verify/calendar-event-profile.integration.test.ts` prove both Adapters use the same generic seam.
