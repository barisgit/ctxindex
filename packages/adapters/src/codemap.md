# packages/adapters/src/

## Responsibility

Implements and bundles ctxindex's built-in provider adapters: the federated `google.mailbox@1` adapter for Gmail search/retrieval/download and reversible Draft Actions, and the indexed `local.directory@1` adapter for deterministic filesystem synchronization.

## Design/patterns

- `builtins.ts` is a composition-only root. Provider modules own their declarative Adapter definitions; `ctxindexBuiltinExtension` bundles them with the provider-neutral `calendarEventProfile`, `communicationMessageProfile`, and `fileProfile`, and `CTXINDEX_BUILTIN_EXTENSIONS` is the host-facing registry input.
- `google-oauth-provider.ts` owns the reusable Google `OAuthProviderSpec`: declared endpoints/hosts, PKCE/client/environment policy, base scopes, and identity extraction paths.
- `google-mailbox/` owns Gmail configuration, definition, declared API host, operations, provider DTO/header/date helpers, response/error handling, and URL/mock routing; see `packages/adapters/src/google-mailbox/codemap.md`.
- `local-directory/sync.ts` orchestrates a deterministic incremental manifest pipeline over configuration, walking, safe reads, canonical refs, and code-point ordering; see `packages/adapters/src/local-directory/codemap.md`.

## Data & control flow

1. Core loads `CTXINDEX_BUILTIN_EXTENSIONS`, registers the two Adapter definitions, and dispatches an operation through an SDK context.
2. Gmail search translates a `SearchContext` query into bounded Gmail API pagination and returns `communication.message@1` resources plus truncation warnings. Retrieval resolves a message/draft Ref, fetches and validates Gmail data, then emits a resource and attachment descriptors; download streams attachment bytes through `DownloadContext.write`.
3. Gmail Draft Actions validate Profile-owned create/update inputs, call Gmail, and return a normalized `communication.message@1` `RetrievedResource`.
4. Local-directory sync validates source config/cursor, walks and reads eligible files, emits `file@1` upserts and safe removals, then emits a versioned checkpoint.

## Integration points

- Public surface: `packages/adapters/src/index.ts` re-exports builtins, `googleOAuthProvider`, and provider definitions/configuration; `packages/adapters/package.json` exposes it as `@ctxindex/adapters`.
- Contracts come from `@ctxindex/extension-sdk`; provider-neutral schemas and Profiles come from `@ctxindex/profiles`.
- Uses `@ctxindex/core/errors`, `@ctxindex/core/config`, and `@ctxindex/core/net` for domain errors, development routing, and egress enforcement.
- External boundaries are Gmail/OAuth HTTP APIs and the local filesystem; Zod, `linkedom`, `file-type`, and `ignore` support validation, HTML extraction, file classification, and ignore matching.
