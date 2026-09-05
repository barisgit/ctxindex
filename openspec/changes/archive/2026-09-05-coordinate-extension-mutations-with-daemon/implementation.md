## Capability Implementation Targets

- `extension-installation` → `openspec/specs/extension-installation/implementation.md`
- `local-daemon` → `openspec/specs/local-daemon/implementation.md`

## Module Ownership

The CLI owns coordination between the existing direct Extension lifecycle services and the local daemon lifecycle. `@ctxindex/core` continues to own package acquisition, complete-registry validation, durable record mutation, and Extension lifecycle serialization. `@ctxindex/local-daemon` continues to own canonical identity and retained file leases; it gains no knowledge of Extensions. The daemon application remains the sole owner of its immutable loaded registry.

## Interfaces and Data Flow

The Extension command service exposes one injected generic mutation coordinator whose operation callback contains the existing install, update, or uninstall call. The production coordinator depends on the existing daemon status, stop, and start operations plus direct database ownership acquisition.

It snapshots daemon status, gracefully stops a running or transitional selected daemon, acquires direct database ownership, invokes the callback, closes ownership, and conditionally restores the previously running daemon. The coordinator is transparent to the callback result type. It preserves the callback error as primary when callback and restoration both fail; a restoration failure remains visible after callback success.

All existing complete-registry loaders and Source/App validation reads execute inside this outer ownership interval. Their existing short-lived read ownership remains an implementation detail and does not define the mutation boundary.

## Storage and State

The coordinator creates no durable state. It retains the existing shared database lease without opening SQLite itself. Extension records and materializations remain owned by core stores. Daemon discovery metadata and exclusive leases remain daemon-lifecycle state.

## Security and Compatibility

Package-code trust and egress boundaries are unchanged. The coordinator must not log raw runtime paths, lease locations, Extension diagnostics, secrets, or provider state. No RPC or persistent format changes are introduced. Unsupported platforms bypass daemon restoration while retaining existing direct semantics.

## Verification

Focused CLI tests inject lifecycle and ownership effects to verify stop–ownership–mutation–release–restart ordering, stopped and unsupported behavior, callback error preservation, and restart failure propagation. Existing Extension command tests prove all three mutation origins use the coordinator without changing parsing, validation, output, or exit behavior. Typecheck, lint, diff checks, strict OpenSpec validation, and the relevant CLI test suite provide the cross-cutting gate.

## Promotion Notes

- Add the CLI-owned daemon/direct-ownership coordination boundary and unchanged core ownership to `openspec/specs/extension-installation/implementation.md`.
- Create `openspec/specs/local-daemon/implementation.md` with the database-lease exclusion seam between direct Extension maintenance and daemon registry startup.
