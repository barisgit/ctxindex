# packages/core/src/net/

## Responsibility

Enforces the generic outbound HTTP egress chokepoint for core OAuth requests and provider Adapter operations.

## Design

- `assertEgressAllowed()` parses a URL, rejects embedded credentials, and permits HTTPS only when its hostname is present in the caller-supplied host list.
- Non-production HTTP or HTTPS loopback endpoints remain available for isolated mocks; all other URLs raise `CtxindexError('egress_denied')`.
- `egressFetch()` is the sanctioned global-fetch wrapper and requires callers to pass the relevant provider or Adapter host declaration.

## Data & control flow

A caller passes a URL, optional `RequestInit`, and an explicit allowed-host list to `egressFetch()`. The wrapper calls `assertEgressAllowed()` before forwarding to global `fetch`; denied or malformed URLs fail before network I/O.

## Integration points

- OAuth token and identity modules pass `OAuthProviderSpec.allowedHosts`.
- `packages/core/src/source/provider-context.ts` passes the selected Adapter's `providerApiHosts` and rechecks requests before token resolution.
- Adapter operation contexts receive the resulting egress-enforcing fetch implementation.
- Depends on `packages/core/src/errors.ts` for policy failures.
