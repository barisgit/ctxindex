# packages/adapters/src/microsoft/mailbox/

## Responsibility

Implements the federated `microsoft.mailbox@1` Adapter for Outlook message search/retrieval, file attachment download, and reversible Draft create/update through Microsoft Graph.

## Design/patterns

- `definition.ts` binds strict empty Source configuration, shared Microsoft OAuth with `Mail.ReadWrite`, `communication.message@1`, Graph host authority, `search-remote`/`retrieve`/`download` operations, and the Profile-owned `communication.message.draft.create` and `.update` schemas to provider handlers.
- `transport.ts` is a compatibility re-export of the provider-root `../transport.ts`, which now owns canonical v1.0/mock URL construction, immutable-ID and text-body `Prefer` headers, typed HTTP/JSON error translation with retry metadata and bounded redacted Graph diagnostics, and same-origin/path validation for provider continuation links shared with Microsoft Calendar.
- `message.ts` validates Graph DTOs and normalizes addresses, Reply-To, RFC References, timestamps, conversation identity, labels, read state, body text, and Artifact descriptors into `communication.message@1` resources.
- `draft.ts` validates strict standalone/reply Action inputs, Graph recipient syntax, and every locally derived MIME header against CR/LF injection. Standalone create/update uses one generic message POST/PATCH; reply create uses one MIME `createReply`, while reply update proves the local Draft provider identity and immutable parent before one PATCH. Stored reply Drafts cannot use the standalone update shape; reply responses must match the derived recipient, subject, line-ending-normalized body, and conversation. Every path has no send handler, provider read, retry, or follow-up mutation.
- `ref.ts` enforces canonical same-Source `ctx://<SOURCE>/message/<immutable-id>`, `ctx://<SOURCE>/draft/<immutable-id>`, and child `/attachment/<id>` Refs before provider I/O; Draft IDs must be canonically percent-encoded immutable IDs.

## Data & control flow

1. `microsoftMailboxSearchRemote()` validates limits/time bounds plus sender and boolean `unread` filters, omits `$search` for match-all enumeration, uses exact `isRead` filtering for unread-only enumeration, and verifies combined search/unread results locally while requesting immutable IDs. It follows at most three validated message pages, excludes drafts/duplicates/out-of-range results, and returns up to 50 normalized resources. When validated provider data remains, it returns a versioned base64url continuation containing the exact Source, normalized query, requested limit, validated progression, and bounded seen IDs plus a truncation warning; resume rejects malformed or Source/query/limit-mismatched tokens before provider I/O and replays a partially consumed page so eligible messages are not lost.
2. `microsoftMailboxRetrieve()` validates the Ref, fetches the exact immutable-ID message while requesting a text body, rejects draft or mismatched responses, and normalizes it into one retrieved communication resource.
3. When Graph reports attachments, retrieval pages through at most ten validated metadata pages using a Graph-compatible property projection while retaining response type annotations, collects descriptors only for safe downloadable `fileAttachment` objects, omits Exchange's approximate size from exact Artifact metadata, warns on unsupported attachment kinds, then emits the resource followed by its Artifacts.
4. `microsoftMailboxDownload()` validates Artifact ownership and descriptor metadata, requests the attachment `$value`, and streams exact bytes through `DownloadContext.write`; the managed store computes the exact cached byte count.
5. `microsoftDraftCreate()` maps standalone content to generic create or a locally derived reply to native MIME `createReply`; `microsoftDraftUpdate()` validates the same-Source Draft Ref and, for replies, requires the stored immutable parent Ref before one Graph patch. Reply paths reject unsafe derived headers before provider I/O; both operations require immutable-ID preferences, reject non-Draft or mismatched responses (with CR/LF-normalized body comparison), and return the canonical complete Draft Resource for core to materialize without sending.

## Integration points

- Registered by `packages/adapters/src/builtins.ts` and exported through `packages/adapters/src/index.ts`; core source/search/retrieve/artifact and Action services invoke it through Extension SDK contexts.
- Depends on `@ctxindex/core/config` and `@ctxindex/core/errors`, `@ctxindex/extension-sdk`, `@ctxindex/profiles`, Zod, and the shared `microsoftOAuthProvider` and provider-root Graph transport.
- External boundary: `https://graph.microsoft.com/v1.0/`, constrained to declared host `graph.microsoft.com` by the Adapter definition and provider execution context.
