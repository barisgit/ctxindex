## Why

Keychain-backed secret writes and deletes update a reserved inventory entry with an unsynchronized read-modify-write sequence. Concurrent mutations can therefore overwrite one another, while authentication reauthorization and refresh currently discard cleanup failures after replacing durable secret references. Together these behaviors can leave untracked or stale Keychain rows without an actionable signal, undermining secret traversal and cleanup.

## What Changes

- Serialize Keychain secret/index mutations so concurrent operations preserve every successful inventory change.
- Keep an individual Keychain mutation failure-aware: a failed index update must not be reported as a successful secret write or delete.
- Make Keychain availability probes use one stable retryable credential outside the normal scoped-secret service namespace and always attempt cleanup after a successful probe write.
- Serialize replacement, refresh, and removal mutations for the same Account so only the final committed Grant references remain authoritative and removal revalidates its exact label after waiting; superseded physical rows may remain pending cleanup without becoming live Grant state.
- Make post-commit authentication cleanup failures explicit through bounded, redacted warnings while preserving the already-committed Grant and successful authorization/refresh behavior.
- Add deterministic mocked-Keychain concurrency and cleanup-failure coverage without accessing native Keychain state.
- Preserve existing secret reference formats, public CLI behavior, and stable exit mappings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `secret-backend-operations`: Keychain inventory mutation consistency, retryable probe cleanup, concurrent mutation ordering, and observable post-commit cleanup failure behavior.
- `account-grant-management`: same-Account Grant mutations serialize, and replacement/refresh cleanup remains bounded and redacted when superseded secrets cannot be deleted after the durable swap.

## Impact

The change affects `@ctxindex/core` Keychain storage and authentication lifecycle internals, their mocked tests, the secret backend and Account/Grant contracts, implementation doctrine, codemaps, and the readable system projection. It introduces no schema migration, public API, credential access, dependency, or provider behavior change.
