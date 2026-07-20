# packages/local-daemon/src/

## Responsibility

Implements process-independent filesystem coordination primitives for the local daemon and exposes them through a thin package barrel.

## Design/patterns

- `index.ts`: public facade over the identity, discovery, and lease APIs.
- `identity.ts`: canonicalizes existing and not-yet-created paths through their longest existing directory ancestor, rejects dangling symlinks and impossible regular-file ancestry, and derives versioned domain-separated SHA-256 identities.
- `lease.ts`: `FileLeaseBackend` strategy with a Darwin retained-file-descriptor implementation; snapshots validated requests, rejects unsafe parents and hard-linked databases, validates the target/pathname/inode after acquisition, and treats retained kernel locks rather than lock-file contents as the ownership authority.
- `discovery.ts`: validates a closed, versioned metadata schema and owns private runtime-directory checks, deterministic endpoint naming, atomic metadata persistence, descriptor-only reads, exact identity matching, and lifecycle-lease-bound owner cleanup.

## Data & control flow

1. `resolveRuntimeIdentity()` canonicalizes four roots, derives `ctxindex.sqlite`, and returns canonical paths plus safe digests.
2. `resolveEndpoint()` validates or creates a `0700` runtime directory, derives a fixed token from the tuple digest, and enforces the Unix-socket path bound.
3. `writeDiscoveryMetadata()` validates metadata, writes an `0600` temporary file with `O_EXCL | O_NOFOLLOW`, synchronizes it, atomically renames it, and revalidates the result.
4. Discovery reads open once with `O_RDONLY | O_NOFOLLOW`, validate and bound the descriptor before reading, and exact matching compares every runtime digest plus the endpoint token.
5. `acquireFileLease()` snapshots the request, validates the target and parent, opens a permanent `0600` lock file with retained shared or exclusive ownership, rechecks pathname/database identity, and returns an idempotent release handle. `assertRetainedDatabaseLeaseTarget()` supplies the caller's immediate pre-/post-open safety boundary.
6. Discovery cleanup requires the matching live exclusive lifecycle lease and rechecks metadata inode plus ownership immediately before unlinking.

## Integration points

- Discovery uses `RuntimeIdentity` and `canonicalizePath()` from `identity.ts`.
- Lifecycle locks live at `<stateRoot>/daemon/lifecycle.owner.lock`; database locks live at `<databasePath>.owner.lock` and are never unlinked.
- Test-only subprocess helpers live under `src/testing/` and are not exported.
