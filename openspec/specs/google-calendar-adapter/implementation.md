# Google Calendar Adapter Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/adapters — Google Calendar configuration

```ts
export type GoogleCalendarSourceConfig = z.infer<
  typeof googleCalendarSourceConfigSchema
>
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

```

### @ctxindex/adapters — Google Calendar response contracts

```ts
export type GoogleCalendarEventsPage = z.infer<typeof eventsPageSchema>

export class GoogleCalendarSyncTokenInvalidError extends Error {
  constructor();
}

```

### @ctxindex/adapters — Google Calendar sync

```ts
export async function googleCalendarSync(context: SyncContext): Promise<void>;
```

### @ctxindex/adapters — Google Calendar retrieval

```ts
export async function googleCalendarRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

## Implementation doctrine

The Google Calendar module in `@ctxindex/adapters` keeps configuration, transport validation, event normalization, sync, retrieval, and its definition together. It emits `calendar.event@1`; Profile semantics and OAuth orchestration stay outside the module.

One Source selects one calendar and anchored past/future window. The cursor stores the final opaque sync token and sorted Source-local manifest. Full scans require a final token and compare complete results before removals/checkpoint; incremental sync retains the window and applies explicit provider deletions. Exact retrieval uses the same normalizer as sync.

## Verification

Definition, config, response, normalization, sync-token/window/manifest, retrieval, and loopback-provider tests are the focused gates. Compiled CLI calendar workflows cover package composition.
