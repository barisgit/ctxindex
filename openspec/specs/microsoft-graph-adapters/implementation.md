# Microsoft Graph Adapters Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Interfaces

These listings prioritize interfaces, type aliases, discriminated unions, and full generic contracts trimmed from the current source. Exported functions appear only where they clarify a module boundary; imports and implementation bodies are omitted.

### @ctxindex/official — Microsoft Calendar configuration

```ts
export type MicrosoftCalendarSourceConfig = z.infer<
  typeof microsoftCalendarSourceConfigSchema
>
```

### @ctxindex/official — Microsoft Calendar normalization

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

### @ctxindex/official — Microsoft Calendar response contracts

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

### @ctxindex/official — Microsoft Calendar sync

```ts
export async function microsoftCalendarSync(
  context: SyncContext,
): Promise<void>;
```

### @ctxindex/official — Microsoft Calendar retrieval

```ts
export async function microsoftCalendarRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### @ctxindex/official — Microsoft mailbox messages

```ts
export type GraphMessage = z.infer<typeof graphMessageSchema>

```

### @ctxindex/official — Microsoft Draft Actions

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

### @ctxindex/official — Microsoft mailbox remote search

```ts
export async function microsoftMailboxSearchRemote(
  context: SearchContext,
): Promise<SearchRemoteResult>;
```

### @ctxindex/official — Microsoft mailbox retrieval

```ts
export async function microsoftMailboxRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

### @ctxindex/official — Microsoft mailbox downloads

```ts
export async function microsoftMailboxDownload(
  context: DownloadContext,
): Promise<void>;
```

## Implementation doctrine

The Microsoft modules in `@ctxindex/official` own declarative OAuth metadata, provider DTOs, normalization, and operations. Calendar and mailbox operations depend on the provider-root Graph transport for request construction, continuation validation, response decoding, and normalized errors. Mailbox retrieval orchestrates message and attachment DTOs into generic Resources and Artifacts; Draft handlers map schema-inferred standalone or reply inputs and local Resource resolution into Graph requests, then normalize `RetrievedResource` results. Core sees only generic Resources, warnings, checkpoints, Artifacts, and Action results. Exact paging, sizing, retry, mutation, and diagnostic behavior lives in the capability spec and applicable delta specs.

Attachment-bearing standalone and native-reply Draft creation normalizes and validates every To/Cc/Bcc value through the same Graph recipient seam, quotes display names where MIME requires it, renders one validated MIME message containing exact managed bytes, and performs one immutable-id POST without follow-up attachment mutations. Attachment-free standalone create retains the JSON request. Update always uses one JSON PATCH that omits the attachment collection, preserving existing provider attachments and immutable reply context without a provider read, retry, add/delete route, or send route.

Microsoft mailbox remote search owns a private versioned base64url continuation containing one validated Graph page URL, exact Source id, exact normalized query identity, requested limit, and the bounded set of previously emitted immutable message ids. It validates token schema, Source/query/limit binding, id uniqueness, and Graph host/path progression before provider I/O while independently capping each invocation at 50 results. Match-all enumeration omits `$search`; unread-only enumeration uses `$filter=isRead eq false` for Profile `unread=true` and `$filter=isRead eq true` for `unread=false`. Combined text/KQL plus unread uses documented message `$search` alone and verifies unread locally because Graph does not document combining message `$search` with `$filter`. Every initial or resumed fetch supplies the immutable-id preference; completed pages add emitted ids to the cursor, suppress prior-page duplicates, unread mismatches, and Drafts, replay a partially consumed page rather than discarding eligible messages, and expose another opaque cursor only while validated provider data remains. Provider-neutral core then verifies normalized payloads through the Profile extractor.

## Verification

Transport/provider tests, calendar reconciliation/cursor tests, mailbox search/retrieve/download tests, Draft/no-send tests, auth integration, and compiled multi-provider workflows verify the interfaces. Mailbox search tests prove omitted match-all `$search`, exact unread `$filter`, supported combined text/unread behavior, malformed/Source/query-mismatched cursor zero-I/O rejection, the 50-result boundary, immutable resumed requests, Draft/duplicate suppression, and oversized-page rejection. The synthetic Graph mock rejects unsupported wildcard search, `IsRead:` KQL, and combined message `$search`/`$filter`. Transport tests prove diagnostic classification and redaction; interpreted and relocated compiled Outlook workflows prove resumable generic search plus remote search to exact get, paged Artifact listing, exact-byte download, and cache reuse while rejecting annotation selection as an OData property.
