## Context

The Keychain backend stores each secret as its own credential and maintains a reserved credential containing the enumerable secret inventory. `setSecret` and `deleteSecret` currently mutate those two pieces independently, and the inventory uses an unguarded read-modify-write. Authentication writes replacement Grant secrets before a database reference swap, but cleanup of superseded entries catches and discards every deletion failure. The affected operator needs concurrent auth and secret operations to avoid accumulating invisible or stale credentials, while logs and errors must remain safe when the native backend is locked or unavailable.

## Goals / Non-Goals

**Goals:**

- Preserve all successful Keychain inventory mutations within one ctxindex process, including calls through distinct backend instances.
- Avoid reporting a Keychain write as successful when inventory publication failed, and keep failed partial work discoverable or compensated.
- Prevent availability probes from accumulating uniquely named credentials when read or cleanup fails.
- Ensure concurrent replacement and refresh operations for one Account cannot strand a losing operation's fresh secret references.
- Preserve successful durable Grant replacement and refresh while emitting one bounded warning when old-secret cleanup remains pending.
- Keep diagnostics free of secret values, config keys, token material, and typed secret references.

**Non-Goals:**

- Cross-process locking or a new native Keychain storage format.
- Reading, repairing, or migrating a user's existing Keychain during this change.
- Adding a public cleanup command, database migration, new exit code, or provider-specific behavior.
- Making Keychain available while the operating-system store is locked.

## Decisions

### Serialize inventory-bearing operations with one process-wide queue

All Keychain mutations and inventory reads share a module-owned asynchronous critical section. A process-wide queue, rather than an instance field, covers the multiple `KeychainBackend` instances composed by CLI services. It preserves throughput for ordinary secret reads and avoids dependencies or filesystem locks.

Alternatives considered were optimistic compare-and-swap, which keytar does not expose, and a filesystem lock, which would introduce a second persistence boundary and would not reliably coordinate all supported credential stores.

### Publish inventory before a new credential value

A set operation first writes the intended inventory state while holding the queue, then writes the credential value. If the credential write fails, it attempts to restore the prior inventory and returns the existing backend failure. This ordering ensures a crash or failed compensation can leave at worst a discoverable inventory entry rather than an untracked secret. Rewriting an existing ref restores the prior entry on failure.

A delete operation removes the credential and then removes its inventory entry in the same critical section. If the latter fails, the operation fails and leaves a retryable stale inventory entry rather than falsely reporting success.

### Warn after durable Grant swaps instead of rolling them back

Once reauthorization or refresh has durably replaced database references, failure to delete superseded secrets does not invalidate the usable new Grant. Cleanup returns a failure count and authentication emits one structured warning containing only the Provider, Grant id, lifecycle phase, and count. The public operation keeps its existing result and exit behavior. Rollback and Account-removal cleanup use the same explicit warning discipline.

### Use one retryable probe identity

The Keychain availability probe writes one reserved credential identity, reads it back, and attempts deletion in all paths after a successful write. A read or deletion failure returns the existing bounded backend error. Reusing the reserved identity means a later probe overwrites and retries cleanup of the same row instead of accumulating an unbounded series of probe credentials.

### Serialize mutations per Account identity

Grant authorization, refresh, and Account removal join a module-owned asynchronous queue keyed by exact Provider and external user id. A waiter re-reads current Grant state inside the critical section before writing or refreshing. Unrelated Accounts remain concurrent, while same-Account operations clean the references they actually supersede and leave only the final committed App/token references live.

## Risks / Trade-offs

- **A second ctxindex process can still race the reserved inventory.** → Document the process-local boundary explicitly; solving cross-process serialization requires a separately designed lock or storage format.
- **A process crash between inventory and credential writes can leave a stale index entry.** → The entry remains discoverable and retryable; no secret becomes untracked through the chosen order.
- **Post-commit cleanup warnings do not automatically retry deletion.** → The consistent inventory retains failed entries for existing traversal/backend-switch cleanup; a dedicated repair command remains separate future scope.
- **A locked Keychain can prevent both the primary mutation and compensation.** → Return the existing bounded backend error and never expose the affected reference or value.
- **Same-Account auth operations wait across provider network latency.** → The queue is scoped to one exact Account identity; serializing token rotation is necessary to keep the durable Grant and secret store consistent.

## Migration Plan

No automatic migration or live repair runs. Existing refs and the reserved index format remain unchanged. New operations use the serialized, failure-aware behavior immediately. Existing stale rows remain eligible for current inventory traversal and backend-switch cleanup.

## Open Questions

None.
