# packages/adapters/src/google-mailbox/

## Responsibility

Owns the complete `google.mailbox` Adapter module: configuration and definition, Gmail search/retrieval/download and reversible Draft operations, provider message helpers, response handling, and development URL routing.

## Design/patterns

- `config.ts` owns `gmailSourceConfigSchema`; `definition.ts` binds Profile-owned Draft schemas and the module's operations into `gmailAdapterDefinition`.
- `message.ts` owns the provider DTO plus header, date, and message-ID helpers; `response.ts` owns JSON decoding and HTTP-status-to-`CtxindexSyncError` mapping.
- `url.ts` provides `gmailApiUrl()` and accepts non-production mock routing only through loopback `127.0.0.1`.
- Capability files keep provider request construction and payload validation local to search, retrieve, download, and Draft behavior.

## Data & control flow

1. Core invokes an operation from `gmailAdapterDefinition` with an SDK context whose `fetch` implementation enforces egress policy.
2. The operation builds its Gmail endpoint through `gmailApiUrl()` and sends the provider request through `context.fetch`.
3. `gmailJson()` maps non-success statuses to stable sync errors and decodes JSON; each operation validates the payload it owns.
4. The operation returns Profile-shaped resources, artifacts, or reversible Draft Action results.

## Integration points

- `packages/adapters/src/builtins.ts` imports `gmailAdapterDefinition` for Extension composition; `packages/adapters/src/index.ts` re-exports the definition and config schema.
- Depends on SDK operation contexts, Profile schemas, `@ctxindex/core/config` for mock routing, and `@ctxindex/core/errors` for stable sync error semantics.
