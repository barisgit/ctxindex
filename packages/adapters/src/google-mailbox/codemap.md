# packages/adapters/src/google-mailbox/

## Responsibility

Owns the complete `google.mailbox` Adapter module: configuration and definition, Gmail search/retrieval/download and reversible Draft operations, provider message helpers, response handling, and development URL routing.

## Design/patterns

- `config.ts` owns `gmailSourceConfigSchema`; `definition.ts` binds the shared `googleOAuthProvider`, Gmail operation scopes, `gmail.googleapis.com` API-host authority, Profile-owned Draft schemas, and the module's operations into `gmailAdapterDefinition`.
- `message.ts` owns the provider DTO plus header, address, date, Message-ID, and References helpers; `response.ts` owns JSON decoding and HTTP-status-to-`CtxindexSyncError` mapping.
- `url.ts` provides `gmailApiUrl()` and accepts non-production mock routing only through loopback `127.0.0.1`.
- Capability files keep provider request construction and payload validation local to search, retrieve, download, and Draft behavior. `draft.ts` derives reply context from a complete local parent on create, then preserves the stored Draft recipient, subject, References, and Gmail thread identity on update while requiring its immutable `replyToRef`.

## Data & control flow

1. Core invokes an operation from `gmailAdapterDefinition` with an SDK context whose `fetch` implementation permits only the Adapter-declared `gmail.googleapis.com` host (plus non-production loopback mocks).
2. The operation builds its Gmail endpoint through `gmailApiUrl()` and sends the provider request through `context.fetch`.
3. `gmailJson()` maps non-success statuses to stable sync errors and decodes JSON; each operation validates the payload it owns.
4. Draft reply branches resolve a complete eligible parent locally, reject CR/LF in every MIME header value, and perform exactly one `drafts.create` or `drafts.update` mutation. Reply update rejects omitted, changed, or incomplete stored reply context before provider I/O and uses the Draft's stored thread/headers rather than mutable parent metadata; Gmail must return that requested thread before the canonical Draft Resource is materialized.

## Integration points

- `packages/adapters/src/builtins.ts` imports `gmailAdapterDefinition` for Extension composition; `packages/adapters/src/index.ts` re-exports the definition and config schema.
- Depends on SDK operation contexts, Profile schemas, `@ctxindex/core/config` for mock routing, and `@ctxindex/core/errors` for stable sync error semantics.
