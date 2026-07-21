## MODIFIED Requirements

### Requirement: Typed sync errors and stable CLI exits
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

Adapters MUST surface failure as a typed `CtxindexSyncError` (or subclass) carrying one of the following codes. The sync runner is the only component that translates these into persisted `sync_runs.status` and `source_sync_state.last_status`.

```text
CtxindexSyncError codes
  auth_expired             refresh token still valid; access token expired and refresh failed
  auth_revoked             refresh token rejected; user must re-authorize
  rate_limited             provider rate or quota limit, with retryAfterMs when known
  network                  DNS/TCP/TLS failure or timeout
  provider_unavailable     5xx from provider
  provider_bad_response    response parse / Zod-validation failure
  provider_quota           account quota exhausted (e.g. mailbox over storage)
  not_found                resource referenced by cursor no longer exists
  permission_denied        403 / scope mismatch from provider
  cancelled                aborted by SIGINT, SIGTERM, or explicit cancel
  unknown                  fallback; MUST include cause for diagnostics
```

Adapters MAY also yield non-fatal warning operations. Warning operations MUST increment warning accounting only and MUST NOT alter error accounting or terminal status.

Mapping rules (normative):

- `sync_runs.status` = `completed` only when the iterator completes without throwing.
- `sync_runs.status` = `cancelled` when the cause was `cancelled`.
- `sync_runs.status` = `failed` for every other code.
- `source_sync_state.last_status` = `needs_auth` for `auth_expired | auth_revoked`.
- `source_sync_state.last_status` = `idle` after a `completed` run, including warning-only completion.
- `source_sync_state.last_status` = `failed` for every other terminal error.
- `source_sync_state.last_status` = `disabled` is set only by the CLI, never by the runner.

User-visible CLI exit codes MUST remain stable: `0` success, `2` invalid usage, `10` `needs_auth`, `20` rate-limited, `30` network/provider, `40` permission denied, `50` other sync failure, `130` cancelled (SIGINT). A warning-only completed run MUST exit `0`. Client, Account, and Source label collisions MUST exit `2`, name the taken label, and make no change; they MUST NOT prompt, normalize, or automatically suffix the label.

#### Scenario: Typed failures map to stable persisted statuses and exit codes
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: Warning does not become an error
- **WHEN** a run emits a non-fatal warning and completes
- **THEN** the warning is reported as a warning, the run has zero errors, and the CLI exits 0
