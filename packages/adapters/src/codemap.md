# packages/adapters/src/

## Responsibility

Implements and bundles ctxindex's built-in provider adapters: indexed read-only `google.calendar@1` and `microsoft.calendar@1`, federated Gmail and Microsoft Outlook mailbox search/retrieval/download, reversible Gmail and Microsoft Graph Outlook Draft create/update Actions, and indexed `local.directory@1` filesystem synchronization.

## Design/patterns

- `builtins.ts` is a composition-only root. `ctxindexBuiltinExtension` bundles provider-neutral calendar, communication-message, and file Profiles with Google Calendar, Gmail, local-directory, Microsoft Calendar, and Microsoft mailbox Adapter definitions; `CTXINDEX_BUILTIN_EXTENSIONS` is the host-facing registry input.
- `google-oauth-provider.ts` and `microsoft/provider.ts` own reusable provider-neutral OAuth declarations, including endpoints, identity extraction, PKCE/client policy, scopes, add-time client-credential environment keys, and allowed hosts. Built-ins declare a client ID plus Google's optional client secret; refresh tokens are Grant-owned runtime state rather than environment inputs.
- Provider folders isolate configuration, definitions, provider DTO validation, operation implementations, response handling, canonical Refs, and transport/test routing. Draft handlers bind the shared communication Profile schemas while retaining provider-owned reply derivation, payload translation, response attestation, and mutation I/O. Detailed maps: `google-calendar/codemap.md`, `google-mailbox/codemap.md`, `local-directory/codemap.md`, and `microsoft/codemap.md`.
- `mail/mime.ts` is the shared Draft-only MIME boundary: it resolves ordered managed Artifacts, enforces portable metadata/count/byte limits, and renders deterministic CRLF multipart content with collision-safe boundaries and folded base64 bytes.

## Data & control flow

1. Core loads `CTXINDEX_BUILTIN_EXTENSIONS`, registers the five Adapter definitions, and dispatches capability-specific operations through SDK contexts.
2. Google and Microsoft Calendar sync reconcile rolling-window events and cursors into `calendar.event@1`; Microsoft uses delta progression for the default calendar, bounded scans for selected calendars, and direct event retrieval. Gmail provides bounded remote search, retrieval, attachment download, and reversible standalone or threaded-reply Draft create/update; both mailbox Adapters can create one MIME Draft from verified managed Artifact bytes.
3. Provider-root Microsoft Graph transport centralizes URL/mock routing, preferences, JSON/error handling, retry metadata, and opaque continuation validation for calendar and mailbox operations. Microsoft mailbox search translates supported queries to bounded Graph KQL paging; retrieval validates immutable message Refs, requests text bodies, and emits normalized communication resources plus attachment descriptors; download streams validated Graph `$value` bytes. Outlook standalone Drafts use generic create/update while replies use native MIME `createReply` or a reply-preserving PATCH; each path performs one mutation and returns `ctx://<SOURCE>/draft/<immutable-id>` without any send route.
4. Local-directory sync walks and reads eligible files, emits `file@1` upserts and safe removals, then checkpoints its deterministic manifest. Stateful provider mocks exercise aggregate mailbox and calendar workflows at CLI e2e scope.

## Integration points

- `index.ts` exports built-in composition, Google and Microsoft OAuth providers, and all individual Adapter definitions/config schemas—including Microsoft Calendar—through `@ctxindex/adapters`.
- Contracts come from `@ctxindex/extension-sdk`; provider-neutral schemas and Profiles come from `@ctxindex/profiles`; core supplies typed errors, central environment access, development routing, and egress enforcement.
- External boundaries are Google OAuth/Calendar/Gmail, Microsoft OAuth/Graph, and the local filesystem.
