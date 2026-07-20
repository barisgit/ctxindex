# packages/local-daemon/

## Responsibility

Provides the private local-daemon infrastructure boundary: canonical runtime identity, secure retained file leases, and validated discovery metadata and endpoint resolution.

## Design/patterns

- `package.json` exposes one ESM facade through `src/index.ts` and has no runtime dependencies.
- Canonical filesystem roots and domain-separated SHA-256 digests identify one ctxindex runtime tuple and SQLite database without exposing raw paths.
- The `FileLeaseBackend` strategy has a Darwin implementation using retained, non-blocking `open(2)` shared/exclusive locks through `node:fs`.
- Discovery and lease files reject symlinks, hardlinks, non-private modes, foreign ownership, unsafe parents, and pathname substitution. Discovery writes use create-exclusive temporary files, `fsync`, and atomic rename; reads use one bounded no-follow descriptor. Lease-file contents never identify an owner; retained kernel locks are the only ownership authority.

## Data & control flow

1. A caller supplies effective config, data, state, and cache roots to `resolveRuntimeIdentity()`.
2. The package canonicalizes the roots and SQLite path, then derives member, tuple, and database digests.
3. Lease callers acquire a lifecycle or database shared/exclusive lease for a canonical target, assert the retained database target immediately around database open, and retain the handle until `release()`.
4. Daemon composition resolves a deterministic short Unix-socket endpoint and writes bounded metadata beneath the canonical state root.
5. Clients strictly validate metadata and reject another canonical runtime tuple before connecting.
6. Cleanup requires the retained exclusive lifecycle lease and removes metadata only when its inode, `instanceId`, and `ownerToken` still match.

## Integration points

- Consumed by daemon and CLI composition for identity, discovery, and retained lease ownership; it contains no RPC, storage composition, provider, Extension, or CLI behavior.
- Depends only on Node built-ins (`crypto`, `fs`, `os`, and `path`).
- File leases support Darwin and fail closed on unsupported platforms or filesystems.
