## Capability Implementation Targets

- `secret-backend-operations` → `openspec/specs/secret-backend-operations/implementation.md`
- `account-grant-management` → `openspec/specs/account-grant-management/implementation.md`

## Module Ownership

`@ctxindex/core` continues to own `SecretsStore`, the Keychain backend, the routing Secret Vault, Grant persistence, and refresh. The Keychain adapter alone coordinates its reserved inventory with native credential mutations. Authentication consumes only the existing `SecretsStore` and injected `Logger`; it does not inspect backend-specific state or depend on keytar.

No CLI, Provider, Adapter, SDK, or database layer gains Keychain-specific behavior.

## Interfaces and Data Flow

The public `SecretsStore` and `AuthService` interfaces remain unchanged. Keychain mutation serialization is a private module seam shared across backend instances in one process. `setSecret` publishes the intended inventory inside the critical section before writing the credential, attempts to restore the prior inventory when the credential write reports failure, and returns the existing typed reference only after both steps succeed. When credential write and compensation both report failure, the original credential-write error remains authoritative, the intended inventory entry may remain, no reference is returned, and the adapter makes no claim about whether a failed native call took effect. `deleteSecret` deletes the credential then removes the inventory entry under the same critical section. `listKeys` joins the critical section so it cannot observe an in-process intermediate inventory state. `probeAvailable` uses one reserved credential identity outside the normal `ctxindex/<scope>` service namespace, always attempts deletion after a successful write, and treats read or deletion failure as unavailable so a later probe retries the same row.

Authentication cleanup remains an internal helper over `SecretsStore.deleteSecret`. It returns the failed-entry count. Callers retain the original pre-commit failure or the committed post-swap success and emit a single structured warning through the injected `Logger` when the count is nonzero. Warning bindings are exactly Provider id, Grant id, lifecycle phase, and failed-entry count; Account id, failed refs, caught backend errors, secret material, and other sensitive fields are excluded. A process-wide queue keyed by exact Provider and external user id serializes authorization, refresh, and removal for one Account; each waiter reads current Grant state only after acquiring the queue, and removal revalidates its exact label before deletion.

## Storage and State

The existing individual `ctxindex/<scope>` credentials and reserved `ctxindex` / `__ctxindex_keys__` inventory remain the durable format. The serialization queue is ephemeral process memory and always releases in `finally`, including failed operations. No database column, migration, compatibility alias, or repair marker is introduced.

Failed compensation favors discoverability: the reserved inventory may retain a stale entry, which existing traversal and backend-switch cleanup can see, but the implementation does not intentionally create an unindexed new credential.

## Security and Compatibility

All automated coverage injects an in-memory keytar shim or the isolated file-backed Keychain mock. Native Keychain and provider state remain outside the test lane. Existing typed refs, stable exit mapping, backend selection, public outputs, and redaction policy are unchanged. Cleanup logs exclude refs, keys, values, tokens, configuration, and raw caught errors.

The queue provides in-process consistency only; no cross-process guarantee is added. Provider egress is unaffected.

## Verification

Keychain tests deterministically interleave concurrent writes across backend instances, verify complete deterministic inventory, cover inventory/credential failure ordering and retryable deletion, and force probe read/deletion failures without native Keychain access. Authentication tests deterministically overlap same-Account reauthorization and refresh, require that only current refs remain live, force cleanup deletion failures, assert committed replacement state remains usable, and inspect warnings for bounded safe fields and absence of canaries/refs.

Run focused Keychain and Grant snapshot/auth tests, core typecheck and lint, secret/redaction/architecture checks, the complete repository CI gate, strict OpenSpec validation, diff checking, cartography, and independent review.

## Promotion Notes

- Promote the process-wide Keychain mutation queue, inventory-first set flow, delete ordering, failure compensation, and mocked concurrency verification into `openspec/specs/secret-backend-operations/implementation.md`.
- Promote cleanup failure counting, safe structured warning fields, post-commit success preservation, and reauthorization/refresh verification into `openspec/specs/account-grant-management/implementation.md`.
