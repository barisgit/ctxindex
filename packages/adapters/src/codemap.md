# packages/adapters/src/

## Responsibility

Implements and bundles ctxindex's built-in provider adapters: indexed read-only `google.calendar@1`, federated Gmail and Microsoft Outlook mailbox search/retrieval/download, reversible Gmail and Microsoft Graph Outlook Draft create/update Actions, and indexed `local.directory@1` filesystem synchronization.

## Design/patterns

- `builtins.ts` is a composition-only root. `ctxindexBuiltinExtension` bundles provider-neutral calendar, communication-message, and file Profiles with Google Calendar, Gmail, local-directory, and Microsoft mailbox Adapter definitions; `CTXINDEX_BUILTIN_EXTENSIONS` is the host-facing registry input.
- `google-oauth-provider.ts` and `microsoft/provider.ts` own reusable provider-neutral OAuth declarations, including endpoints, identity extraction, PKCE/client policy, scopes, credential environment keys, and allowed hosts.
- Provider folders isolate configuration, definitions, provider DTO validation, operation implementations, response handling, canonical Refs, and transport/test routing. Draft handlers bind the shared communication Profile schemas while retaining provider-owned payload translation and mutation I/O. Detailed maps: `google-calendar/codemap.md`, `google-mailbox/codemap.md`, `local-directory/codemap.md`, and `microsoft/codemap.md`.

## Data & control flow

1. Core loads `CTXINDEX_BUILTIN_EXTENSIONS`, registers the four Adapter definitions, and dispatches capability-specific operations through SDK contexts.
2. Google Calendar sync reconciles rolling-window events and cursors; Gmail provides bounded remote search, retrieval, attachment download, and reversible Draft create/update.
3. Microsoft mailbox search translates supported queries to bounded Graph KQL paging; retrieval validates immutable message Refs, requests text bodies, and emits normalized communication resources plus attachment descriptors; download streams validated Graph `$value` bytes. Outlook Draft create/update POSTs or PATCHes once with immutable-ID and text-body preferences, validates the complete response, and returns `ctx://<SOURCE>/draft/<immutable-id>` without any send route.
4. Local-directory sync walks and reads eligible files, emits `file@1` upserts and safe removals, then checkpoints its deterministic manifest. A stateful Graph mock verifies Outlook mutation-to-cache behavior only at the CLI e2e aggregate boundary.

## Integration points

- `index.ts` exports built-in composition, Google and Microsoft OAuth providers, and individual Adapter definitions/config schemas through `@ctxindex/adapters`.
- Contracts come from `@ctxindex/extension-sdk`; provider-neutral schemas and Profiles come from `@ctxindex/profiles`; core supplies typed errors, central environment access, development routing, and egress enforcement.
- External boundaries are Google OAuth/Calendar/Gmail, Microsoft OAuth/Graph, and the local filesystem.
