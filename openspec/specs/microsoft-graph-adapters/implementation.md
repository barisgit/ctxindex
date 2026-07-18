# Microsoft Graph Adapters Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/adapters — Microsoft Calendar configuration

```ts
export type MicrosoftCalendarSourceConfig = z.infer<
  typeof microsoftCalendarSourceConfigSchema
>
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

```

### @ctxindex/adapters — Microsoft Calendar response contracts

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

```

### @ctxindex/adapters — Microsoft Calendar sync

```ts
export async function microsoftCalendarSync(
  context: SyncContext,
): Promise<void>;
```

### @ctxindex/adapters — Microsoft Calendar retrieval

```ts
export async function microsoftCalendarRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### @ctxindex/adapters — Microsoft mailbox messages

```ts
export type GraphMessage = z.infer<typeof graphMessageSchema>

```

### @ctxindex/adapters — Microsoft Draft Actions

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

### @ctxindex/adapters — Microsoft mailbox remote search

```ts
export async function microsoftMailboxSearchRemote(
  context: SearchContext,
): Promise<SearchRemoteResult>;
```

### @ctxindex/adapters — Microsoft mailbox retrieval

```ts
export async function microsoftMailboxRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### @ctxindex/adapters — Microsoft mailbox downloads

```ts
export async function microsoftMailboxDownload(
  context: DownloadContext,
): Promise<void>;
```

## Implementation doctrine

The Microsoft modules in `@ctxindex/adapters` own declarative OAuth metadata, shared Graph transport, provider DTOs, normalization, and operations. Core sees generic Resources, warnings, checkpoints, Artifacts, and Action results.

Calendar requests use immutable-id/UTC preferences. The default collection can retain a final delta link; named calendars use complete scans plus manifests. Mailbox search/retrieve/download and Drafts use the shared transport. Mailbox retrieval accumulates every bounded, validated attachment metadata page with a Graph-compatible field projection before emitting provider-neutral Resources and Artifacts. Exchange attachment `size` is approximate aggregate metadata, so retrieval omits it from exact Artifact descriptors and the managed store derives exact byte size from the download stream. Standalone Drafts use generic message create/update, but standalone update rejects a locally stored target with reply context. Reply Draft creation uses one CR/LF-safe MIME `createReply` mutation against the locally resolved parent; reply update proves the stored immutable provider Draft identity and parent Ref locally before one PATCH and performs no Graph read. Reply responses must normalize to the validated recipient, subject, semantically equivalent text-body line endings, and conversation before local fields are completed. Draft mutations request immutable ids, normalize one response, and are never automatically retried.

Shared Graph transport owns bounded failure-body parsing and status-based normalized classification. It may expose only validated provider codes, fixed technical wording, and redacted request-identifier presence; arbitrary provider wording, raw bodies, and identifier values do not cross the Adapter boundary.

## Verification

Transport/provider tests, calendar reconciliation/cursor tests, mailbox search/retrieve/download tests, Draft/no-send tests, auth integration, and compiled multi-provider workflows verify the interfaces. Transport tests prove diagnostic classification and redaction; the Outlook replay proves remote search to exact get, paged Artifact listing, exact-byte download, and cache reuse while rejecting annotation selection as an OData property.
