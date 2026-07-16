# packages/core/src/artifact/

## Responsibility

Extracts Artifact descriptors from hydrated Resources, downloads provider bytes, and maintains a verified local content-addressed Artifact cache plus SQLite metadata.

## Design/patterns

- `ArtifactService` in `artifact-service.ts` is the application-service facade over profile extraction, adapter download capability, and `ArtifactStore`.
- `ArtifactStore` in `artifact-store.ts` implements a SHA-256 content-addressed store under `dataDir()/artifacts`, with write/commit/abort semantics, immutable Ref-to-content binding, and integrity checks on reads.
- `ArtifactService.inFlight` provides single-flight deduplication per Artifact Ref; `activeDownloads`/`purging` enforce mutual exclusion between downloads and purge.
- `index.ts` re-exports the service and store APIs.

## Data & control flow

1. `ArtifactService.list()` loads a Resource through `ResourceStore`, resolves its Profile, validates the payload, and invokes `profile.artifacts()`; descriptors must extend the exact Resource Ref and remain in the same Source.
2. `download()` returns a verified cache hit or deduplicates a `materialize()` call. Materialization finds the owning Resource, verifies the adapter's `download` capability, builds a provider context, and streams adapter chunks into `ArtifactStore.write()`.
3. `ArtifactStore.createWriter()` hashes temporary bytes, validates metadata and byte size, hard-links content into `sha256/<prefix>/<hash>`, then records the `artifacts` row; `get()` rehashes and verifies stored objects.
4. `copyTo()` creates output without overwriting; `purge()` transactionally clears metadata, quarantines managed trees, removes bytes, and reports post-purge accounting.

## Integration points

- Profile/adapter contracts: `@ctxindex/extension-sdk` and `packages/core/src/registry/`.
- Resource ownership: `packages/core/src/resource/resource-store.ts` and SQLite `resources`/`artifacts` tables.
- Authenticated provider I/O: `packages/core/src/source/provider-context.ts` and `packages/core/src/auth/`.
- Filesystem location and Ref validation: `packages/core/src/paths/` and `packages/core/src/ref/`.
