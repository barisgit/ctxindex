# Google Calendar Adapter Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/adapters/src/google-calendar/config.ts`

```ts
export type GoogleCalendarSourceConfig = z.infer<
  typeof googleCalendarSourceConfigSchema
>
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

### `packages/adapters/src/google-calendar/response.ts`

```ts
export type GoogleCalendarEventsPage = z.infer<typeof eventsPageSchema>

export class GoogleCalendarSyncTokenInvalidError extends Error {
  constructor();
}

export async function googleCalendarJson(response: Response): Promise<unknown>;

export async function googleCalendarEventsPage(
  response: Response,
): Promise<GoogleCalendarEventsPage>;
```

### `packages/adapters/src/google-calendar/url.ts`

```ts
export function googleCalendarApiUrl(path: string): string;
```

### `packages/adapters/src/google-calendar/sync.ts`

```ts
export async function googleCalendarSyncAt(
  context: SyncContext,
  now: Date,
): Promise<void>;

export async function googleCalendarSync(context: SyncContext): Promise<void>;
```

### `packages/adapters/src/google-calendar/retrieve.ts`

```ts
export async function googleCalendarRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### Definition exports

```ts
export { googleCalendarSourceConfigSchema } from './config'
export { googleCalendarAdapterDefinition }
```

## Implementation doctrine

`packages/adapters/src/google-calendar` co-locates config, URL/response validation, event normalization, sync, retrieval, definition, and tests. It emits `calendar.event@1`; Profile semantics and OAuth orchestration stay outside the module.

One Source selects one calendar and anchored past/future window. The cursor stores the final opaque sync token and sorted Source-local manifest. Full scans require a final token and compare complete results before removals/checkpoint; incremental sync retains the window and applies explicit provider deletions. Exact retrieval uses the same normalizer as sync.

## Verification

Definition, config, response, normalization, sync-token/window/manifest, retrieval, and loopback-provider tests are the focused gates. Compiled CLI calendar workflows cover package composition.
