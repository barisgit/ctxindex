# packages/adapters/src/microsoft/mailbox/

## Responsibility

Implements the read-only, federated `microsoft.mailbox@1` Adapter for Outlook messages and file attachments through Microsoft Graph.

## Design/patterns

- `definition.ts` binds strict empty Source configuration, shared Microsoft OAuth with `Mail.ReadWrite`, `communication.message@1`, Graph host authority, and `search-remote`, `retrieve`, and `download` operations; Actions are intentionally empty.
- `transport.ts` is the Graph transport boundary: canonical v1.0 URL construction, immutable-ID and text-body `Prefer` headers, typed HTTP/JSON error translation with retry metadata, and same-origin/path validation for provider `@odata.nextLink` values. A development-only `CTXINDEX_GRAPH_MOCK_BASE_URL` accepts only a bare `127.0.0.1` origin.
- `message.ts` validates Graph DTOs and normalizes addresses, headers, timestamps, conversation identity, labels, read state, body text, and Artifact descriptors into `communication.message@1` resources.
- `ref.ts` enforces canonical same-Source `ctx://<SOURCE>/message/<immutable-id>` and child `/attachment/<id>` Refs before provider I/O.

## Data & control flow

1. `microsoftMailboxSearchRemote()` validates limits/time bounds and supported sender filters, builds a bounded Graph KQL `$search`, requests immutable IDs, follows at most three validated message pages, excludes drafts/duplicates/out-of-range results, and returns up to 50 normalized resources plus a truncation warning when more data remains.
2. `microsoftMailboxRetrieve()` validates the Ref, fetches the exact immutable-ID message while requesting a text body, rejects draft or mismatched responses, and normalizes it into one retrieved communication resource.
3. When Graph reports attachments, retrieval pages through at most ten metadata pages, emits descriptors only for safe downloadable `fileAttachment` objects, warns on unsupported attachment kinds, then emits the resource followed by its Artifacts.
4. `microsoftMailboxDownload()` validates Artifact ownership and descriptor metadata, requests the attachment `$value`, streams exact bytes through `DownloadContext.write`, and rejects size or media-type mismatches.

## Integration points

- Registered by `packages/adapters/src/builtins.ts` and exported through `packages/adapters/src/index.ts`; core source/search/retrieve/artifact services invoke it through Extension SDK contexts.
- Depends on `@ctxindex/core/config` and `@ctxindex/core/errors`, `@ctxindex/extension-sdk`, `@ctxindex/profiles`, Zod, and the shared `microsoftOAuthProvider`.
- External boundary: `https://graph.microsoft.com/v1.0/`, constrained to declared host `graph.microsoft.com` by the Adapter definition and provider execution context.
