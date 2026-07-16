# packages/adapters/src/google-mailbox/

## Responsibility

Provides the shared Google/Gmail HTTP boundary: constructs Gmail and OAuth token URLs, enforces the outbound-host policy, validates selected provider payloads, and translates transport or HTTP failures into `CtxindexSyncError` codes.

## Design/patterns

- `api.ts` centralizes endpoint constants and URL builders in `gmailApiUrl()`, `googleTokenUrl()`, and `routeGoogleApiUrl()`; non-production overrides are accepted only for `127.0.0.1`.
- `assertGoogleEgressAllowed()` applies an allowlist guard before `egressFetch()`; `safeFetch()` is a schema-parameterized gateway over `fetchAndParse()` and retries one `rate_limited` response after its `retryAfterMs` delay.
- Zod schemas (`OAuthTokenResponseSchema`, `GmailMessageListSchema`, `GmailMessageSchema`, `GmailHistorySchema`, `GmailProfileSchema`) define tolerant provider DTOs with passthrough fields.
- Provider failures are normalized to domain error codes such as `network`, `auth_revoked`, `permission_denied`, `rate_limited`, `not_found`, `provider_unavailable`, and `provider_bad_response`.

## Data & control flow

1. Callers build an endpoint with `gmailApiUrl()` or `googleTokenUrl()`; configured development URLs may reroute Gmail/OAuth requests to a loopback mock.
2. `safeFetch(schema, url, init)` routes the URL, then `fetchAndParse()` checks egress, optionally records a non-production fetch log, and calls `@ctxindex/core/net`'s `egressFetch()`.
3. The response body is decoded as JSON, HTTP statuses are mapped to `CtxindexSyncError`, and the supplied Zod schema returns a typed payload; rate limiting triggers one delayed retry.
4. `exchangeGoogleRefreshToken()` posts URL-encoded OAuth refresh credentials through this pipeline using `OAuthTokenResponseSchema`.

## Integration points

- `packages/adapters/src/gmail-search-remote.ts`, `gmail-retrieve.ts`, `gmail-download.ts`, and `gmail-draft.ts` consume `gmailApiUrl()` for Gmail operations.
- Depends on `@ctxindex/core/config` for mock/log environment settings, `@ctxindex/core/net` for `EGRESS_ALLOWLIST` and `egressFetch`, and `@ctxindex/core/errors` for sync error semantics.
- Exposes `GOOGLE_EGRESS_ALLOWLIST` as a compatibility re-export of the core network allowlist.
