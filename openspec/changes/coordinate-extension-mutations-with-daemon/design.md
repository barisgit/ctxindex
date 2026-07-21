## Context

The background daemon owns SQLite exclusively and loads one immutable Extension registry at startup. Extension lifecycle commands intentionally remain direct because package acquisition and installed-record mutation are local filesystem operations, but their complete-registry validation reads SQLite-backed local OAuth App identities and Source bindings. Merely stopping the daemon for those reads is insufficient: automatic startup from another CLI process could load the registry while installed state is changing.

## Goals / Non-Goals

**Goals:**
- Make each installed Extension mutation mutually exclusive with daemon database ownership and registry startup.
- Restore a daemon that was running before the lifecycle command.
- Preserve existing lifecycle results, errors, trust notices, cancellation, and unsupported-platform behavior.

**Non-Goals:**
- Route package acquisition or Extension mutation through RPC.
- Reload or mutate a live daemon registry.
- Change Catalog refresh, metadata, installation-record, or registry-validation semantics.
- Add a general daemon maintenance protocol.

## Decisions

The CLI will inspect daemon status before an Extension mutation. If the daemon is running, it will request and await graceful shutdown. The command will then acquire the existing direct database ownership object and retain its shared database lease for the complete mutation, including acquisition, complete-registry validation, and durable installed-record replacement. Daemon startup requires an exclusive lease on the same canonical database, so no daemon can load registry state during this interval.

After the direct ownership is closed, the CLI restarts the daemon only when the initial status was running. Restoration occurs after both successful and failed mutations. A mutation failure remains the primary failure if restoration also fails; a restoration failure after a successful mutation is surfaced rather than reporting a fully successful lifecycle command.

Unsupported platforms keep the same direct path: daemon status reports unsupported and direct ownership has no retained lease because no daemon can own the database there.

Alternatives rejected:
- Live registry reload would require a larger transactional RPC and runtime-recomposition design.
- Stopping without retaining database ownership leaves a startup race.
- Holding only the Extension record lock does not coordinate with daemon startup, which does not take that lock.

## Risks / Trade-offs

- [A concurrent command may try to start the daemon while the shared ownership lease is held and receive the existing bounded ownership failure] → The Extension mutation remains safe and short-lived; retrying the concurrent command starts against the new registry.
- [A daemon restart can fail after the Extension mutation committed] → Surface the lifecycle failure and leave the durable Extension result intact for a later automatic start.
- [Cancellation after shutdown could otherwise leave the daemon stopped] → Restoration does not reuse the cancelled mutation signal.

## Migration Plan

Not applicable. No persistent schema or record format changes.

## Open Questions

None.
