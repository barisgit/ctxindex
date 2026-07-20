# packages/adapters/src/google-mailbox/

## Responsibility

Owns the complete `google.mailbox` Adapter module: configuration and definition, Gmail search/retrieval/download and reversible Draft operations, provider message helpers, response handling, and development URL routing.

## Design/patterns

- `config.ts` owns `gmailSourceConfigSchema`; `definition.ts` directly binds the shared `googleOAuthProvider`, separately declares Gmail operation access scopes and `gmail.googleapis.com` API-host authority, and uses the concrete `communicationMessageProfile` for resource and Profile-owned Draft Action input/output contracts.
- `message.ts` owns the provider DTO plus header, address, date, Message-ID, and References helpers; `response.ts` owns JSON decoding and HTTP-status-to-`CtxindexSyncError` mapping.
- `url.ts` provides `gmailApiUrl()` and accepts non-production mock routing only through loopback `127.0.0.1`.
- Capability files keep provider request construction and payload validation local to search, retrieve, download, and Draft behavior. `draft.ts` derives reply context from a complete local parent on create, resolves managed attachment bytes before fetch, then preserves the stored Draft recipient, subject, References, Gmail thread identity, and proven managed attachment set on update while requiring its immutable `replyToRef`.

## Data & control flow

1. Core invokes an operation from `gmailAdapterDefinition` with an SDK context whose `fetch` implementation permits only the Adapter-declared `gmail.googleapis.com` host (plus non-production loopback mocks).
2. Remote search rejects the generic continuation input before provider I/O because Gmail does not implement resumable ctxindex cursors; otherwise the operation builds its Gmail endpoint through `gmailApiUrl()` and sends the provider request through `context.fetch`.
3. `gmailJson()` maps non-success statuses to stable sync errors and decodes JSON; each operation validates the payload it owns.
4. Draft create branches resolve every selected same-Source managed Artifact from verified cache before fetch and use the shared deterministic MIME renderer for one `drafts.create` mutation. Update performs one full-MIME `drafts.update`, replaying a proven managed set exactly; unknown provenance or unavailable bytes fail locally. Reply paths additionally preserve stored thread/headers rather than mutable parent metadata, and Gmail must return that thread before the canonical Draft Resource is materialized.

## Integration points

- `packages/adapters/src/builtins.ts` imports `gmailAdapterDefinition` for Extension composition; `packages/adapters/src/index.ts` re-exports the definition and config schema.
- Depends on SDK operation contexts, Profile schemas, `@ctxindex/core/config` for mock routing, and `@ctxindex/core/errors` for stable sync error semantics.
