# packages/adapters/src/

## Responsibility

Implements and bundles ctxindex's built-in provider adapters: indexed read-only `google.calendar` and `microsoft.calendar`, federated Gmail and Microsoft Outlook mailbox search/retrieval/download, reversible Gmail and Microsoft Graph Outlook Draft create/update Actions, and indexed `local.directory` filesystem synchronization.

## Design/patterns

- `builtins.ts` is a composition-only root with three named Extensions: `ctxindex.google` groups the Google Calendar and Gmail Adapters, `ctxindex.microsoft` groups Microsoft Calendar and mailbox, and `ctxindex.local` groups local-directory. Each named root carries a generated virtual documentation tree staged from its `builtin-documentation/` directory. The CLI passes the package's actual module namespace to the shared collector; the documentation-free `CTXINDEX_BUILTIN_EXTENSIONS` tuple remains a legacy direct-registry convenience rather than a separately preselected loader input. No Extension owns Profiles or Providers.
- `google-oauth-provider.ts` and `microsoft/provider.ts` declare reusable typed Provider roots with `defineProvider()` and `auth.oauth2()`. They own endpoints, identity extraction, PKCE/registration policy, base scopes, add-time client-credential environment keys, and allowed hosts. Built-ins declare a client ID plus Google's optional client secret; refresh tokens are Grant-owned runtime state rather than environment inputs.
- Every Adapter binds its Provider directly (or has no Provider for local files), declares scoped access separately, and directly imports the concrete Profile definition used for resource and Action contracts.
- Provider folders isolate configuration, definitions, provider DTO validation, operation implementations, response handling, canonical Refs, and transport/test routing. Draft handlers bind the shared communication Profile schemas while retaining provider-owned reply derivation, payload translation, response attestation, and mutation I/O. Detailed maps: `google-calendar/codemap.md`, `google-mailbox/codemap.md`, `local-directory/codemap.md`, and `microsoft/codemap.md`.
- `mail/mime.ts` is the shared Draft-only MIME boundary: it resolves ordered managed Artifacts, enforces portable metadata/count/byte limits, and renders deterministic CRLF multipart content with collision-safe boundaries and folded base64 bytes.

## Data & control flow

1. Core collects the three source-scoped Extension exports from the actual `@ctxindex/adapters` namespace, ignores unrelated exports such as individual leaves and the convenience tuple, validates the embedded documentation values through its shared resolver, and registers their five Adapter definitions; Adapter-to-Provider and Adapter-to-Profile links supply the remaining definition roots before capability dispatch.
2. Google and Microsoft Calendar sync reconcile rolling-window events and cursors into `calendar.event@1`; Microsoft uses delta progression for the default calendar, bounded scans for selected calendars, and direct event retrieval. Gmail provides bounded remote search, retrieval, attachment download, and reversible standalone or threaded-reply Draft create/update; both mailbox Adapters can create one MIME Draft from verified managed Artifact bytes.
3. Provider-root Microsoft Graph transport centralizes URL/mock routing, preferences, JSON/error handling, retry metadata, and opaque continuation validation for calendar and mailbox operations. Microsoft mailbox search translates supported queries to bounded Graph KQL paging; retrieval validates immutable message Refs, requests text bodies, and emits normalized communication resources plus attachment descriptors; download streams validated Graph `$value` bytes. Outlook standalone Drafts use generic create/update while replies use native MIME `createReply` or a reply-preserving PATCH; each path performs one mutation and returns `ctx://<SOURCE>/draft/<immutable-id>` without any send route.
4. Local-directory sync walks and reads eligible files, emits `file@1` upserts and safe removals, then checkpoints its deterministic manifest. Stateful provider mocks exercise aggregate mailbox and calendar workflows at CLI e2e scope.

## Integration points

- `index.ts` exports built-in composition, Google and Microsoft OAuth providers, and all individual Adapter definitions/config schemas—including Microsoft Calendar—through `@ctxindex/adapters`.
- Contracts come from `@ctxindex/extension-sdk`; provider-neutral schemas and Profiles come from `@ctxindex/profiles`; core supplies typed errors, central environment access, development routing, and egress enforcement.
- External boundaries are Google OAuth/Calendar/Gmail, Microsoft OAuth/Graph, and the local filesystem.
