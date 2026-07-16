# packages/core/src/net/

## Responsibility

Enforces the single outbound HTTP egress boundary for core and provider adapters.

## Design

- `EGRESS_ALLOWLIST` is the central provider-host policy.
- `assertEgressAllowed()` is a guard that parses URLs, permits declared hosts, permits loopback hosts only outside production, and raises `CtxindexError('egress_denied')` otherwise.
- `egressFetch()` is the sanctioned wrapper around global `fetch`; response interpretation remains with callers.

## Data & control flow

A caller passes a URL and optional `RequestInit` to `egressFetch()`. The wrapper calls `assertEgressAllowed()` before forwarding unchanged arguments to `fetch`; denied hosts fail before network I/O.

## Integration points

- `packages/core/src/auth/google-client.ts` uses egress checks for Google OAuth and loopback handling.
- `packages/core/src/source/provider-context.ts` exposes the wrapper to provider operations.
- Adapter operation contexts use this module's egress-enforcing fetch implementation for provider traffic.
- Depends on `packages/core/src/errors.ts` for policy failures.
