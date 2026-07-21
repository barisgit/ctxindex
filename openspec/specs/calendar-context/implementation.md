# Calendar Context Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/profiles — calendar event vocabulary

```ts
export type CalendarEvent = z.infer<typeof calendarEventSchema>

export function calendarEventRef(
  sourceId: string,
  opaqueEventId: string,
): string;
```

### @ctxindex/adapters — Google Calendar normalization

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

### @ctxindex/adapters — Microsoft Calendar normalization

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

## Implementation doctrine

`@ctxindex/profiles` owns provider-neutral event validation and pure projections. Google and Microsoft modules in `@ctxindex/adapters` normalize provider responses and construct Source-scoped Refs; core storage, search, retrieval, and CLI code stay provider-neutral.

Calendar sync uses generic operation contexts. Adapter cursors retain an anchored window, provider cursor, and Source-local manifest; changing the window requires complete reconciliation before cursor replacement or removal emission. Calendar definitions bind no Actions.

## Verification

Profile tests cover timed/all-day validation and deterministic projections. Provider normalization, sync reconciliation, exact retrieval, and `tests/tooling/verify/calendar-event-profile.integration.test.ts` prove both Adapters use the same generic seam.
