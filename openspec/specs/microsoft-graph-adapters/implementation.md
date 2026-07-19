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

The Microsoft modules in `@ctxindex/adapters` own declarative OAuth metadata, provider DTOs, normalization, and operations. Calendar and mailbox operations depend on the provider-root Graph transport for request construction, continuation validation, response decoding, and normalized errors. Mailbox retrieval orchestrates message and attachment DTOs into generic Resources and Artifacts; Draft handlers map schema-inferred standalone or reply inputs and local Resource resolution into Graph requests, then normalize `RetrievedResource` results. Core sees only generic Resources, warnings, checkpoints, Artifacts, and Action results. Exact paging, sizing, retry, mutation, and diagnostic behavior lives in the capability spec and applicable delta specs.

Microsoft mailbox remote search owns a private versioned base64url continuation containing one validated Graph page URL, exact normalized query identity, requested limit, and the bounded set of previously emitted immutable message ids. It validates token schema, query/limit binding, id uniqueness, and Graph host/path progression before provider I/O while independently capping each invocation at 50 results. Every initial or resumed fetch supplies the immutable-id preference; completed pages add emitted ids to the cursor, suppress prior-page duplicates and Drafts, replay a partially consumed page rather than discarding eligible messages, and expose another opaque cursor only while validated provider data remains. The Adapter translates Profile `unread=true` to `IsRead:false` and `unread=false` to `IsRead:true`; provider-neutral core then verifies normalized payloads through the Profile extractor.

## Verification

Transport/provider tests, calendar reconciliation/cursor tests, mailbox search/retrieve/download tests, Draft/no-send tests, auth integration, and compiled multi-provider workflows verify the interfaces. Mailbox search tests prove exact unread KQL, malformed/query-mismatched cursor zero-I/O rejection, the 50-result boundary, immutable resumed requests, Draft/duplicate suppression, and oversized-page rejection. Transport tests prove diagnostic classification and redaction; interpreted and relocated compiled Outlook workflows prove resumable generic search plus remote search to exact get, paged Artifact listing, exact-byte download, and cache reuse while rejecting annotation selection as an OData property.
