# Microsoft Graph Adapters Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings are trimmed from the current source. Imports and implementation bodies are omitted; names, parameters, return types, and key data shapes are kept.

### `packages/adapters/src/microsoft/transport.ts`

```ts
export const IMMUTABLE_ID_PREFERENCE = 'IdType="ImmutableId"'

export const TEXT_BODY_PREFERENCE =
  `${IMMUTABLE_ID_PREFERENCE}, outlook.body-content-type="text"`

export function graphUrl(path: string): string;

export function graphHeaders(prefer = IMMUTABLE_ID_PREFERENCE): Headers;

export function graphResponseError(response: Response): CtxindexSyncError;

export async function graphJson(response: Response): Promise<unknown>;

export function validateGraphOpaqueLink(
  value: string,
  routePrefix: string,
): string;
```

### `packages/adapters/src/microsoft/calendar/config.ts`

```ts
export type MicrosoftCalendarSourceConfig = z.infer<
  typeof microsoftCalendarSourceConfigSchema
>
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

### `packages/adapters/src/microsoft/calendar/response.ts`

```ts
export class MicrosoftCalendarDeltaExpiredError extends Error {
  constructor();
}

export type MicrosoftCalendarStrategy = 'delta' | 'scan'

export interface MicrosoftCalendarPage {
  readonly items: readonly unknown[]
  readonly nextLink?: string
  readonly deltaLink?: string
}

export async function microsoftCalendarPage(
  response: Response,
  strategy: MicrosoftCalendarStrategy,
  routePath: string,
): Promise<MicrosoftCalendarPage>;
```

### `packages/adapters/src/microsoft/calendar/sync.ts`

```ts
export async function microsoftCalendarSyncAt(context: SyncContext, now: Date);

export async function microsoftCalendarSync(context: SyncContext);
```

### `packages/adapters/src/microsoft/calendar/retrieve.ts`

```ts
export async function microsoftCalendarRetrieve(context: RetrieveContext);
```

### `packages/adapters/src/microsoft/mailbox/message.ts`

```ts
export type GraphMessage = z.infer<typeof graphMessageSchema>

export function parseGraphMessage(value: unknown): GraphMessage;

export function searchResource(
  sourceId: string,
  message: GraphMessage,
): SearchRemoteResource;

export function retrievedResource(
  ref: string,
  sourceId: string,
  message: GraphMessage,
  attachments: readonly ArtifactDescriptor[],
): RetrievedResource;
```

### `packages/adapters/src/microsoft/mailbox/ref.ts`

```ts
export function parseDraftRef(ref: string, sourceId: string): string;

export function parseMessageRef(ref: string, sourceId: string): string;

export function parseAttachmentRef(
  ref: string,
  originRef: string,
  sourceId: string,
): { messageId: string; attachmentId: string };
```

### `packages/adapters/src/microsoft/mailbox/draft.ts`

```ts
export type MicrosoftDraftCreateInput = z.infer<
  typeof communicationMessageDraftCreateInputSchema
>

export type MicrosoftDraftUpdateInput = z.infer<
  typeof communicationMessageDraftUpdateInputSchema
>

export async function microsoftDraftCreate(
  context: ActionContext<MicrosoftDraftCreateInput>,
): Promise<RetrievedResource>;

export async function microsoftDraftUpdate(
  context: ActionContext<MicrosoftDraftUpdateInput>,
): Promise<RetrievedResource>;
```

### `packages/adapters/src/microsoft/mailbox/search-remote.ts`

```ts
export async function microsoftMailboxSearchRemote(
  context: SearchContext,
): Promise<SearchRemoteResult>;
```

### `packages/adapters/src/microsoft/mailbox/retrieve.ts`

```ts
export async function microsoftMailboxRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### `packages/adapters/src/microsoft/mailbox/download.ts`

```ts
export async function microsoftMailboxDownload(
  context: DownloadContext,
): Promise<void>;
```

### Definition exports

```ts
export { microsoftOAuthProvider }
export { microsoftCalendarSourceConfigSchema }
export { microsoftCalendarAdapterDefinition }
export { microsoftMailboxSourceConfigSchema }
export { microsoftMailboxAdapterDefinition }
```

## Implementation doctrine

`packages/adapters/src/microsoft` owns declarative OAuth metadata and shared Graph transport; `calendar` and `mailbox` submodules own provider DTOs, normalization, operations, and tests. Core sees generic Resources, warnings, checkpoints, Artifacts, and Action results.

Calendar requests use immutable-id/UTC preferences. The default collection can retain a final delta link; named calendars use complete scans plus manifests. Mailbox search/retrieve/download and Drafts use the shared transport. Draft mutations request immutable ids, normalize one response, and are never automatically retried.

## Verification

Transport/provider tests, calendar reconciliation/cursor tests, mailbox search/retrieve/download tests, Draft/no-send tests, auth integration, and compiled multi-provider workflows verify the interfaces.
