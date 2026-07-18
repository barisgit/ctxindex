# packages/core/src/catalog/

## Responsibility

Owns provider-neutral trusted Git Catalog registration, immutable snapshot acquisition, strict manifest and provenance persistence, and explicit Extension install/uninstall lifecycle.

## Design / patterns

- `CatalogService` is the application-service facade for Catalog add/list/show/refresh/remove and Extension install/uninstall; read/install callers explicitly select refresh or stored-snapshot behavior.
- `schema.ts` defines closed Zod contracts and deterministic manifest, entry, path, and setup bounds; `paths.ts` enforces lexical and realpath containment.
- `repository.ts` validates public credential-free HTTPS or absolute local repositories and exact full refs/OIDs before effects.
- `git.ts` is the hardened system-Git acquisition adapter. It fetches one ref into temporary bare storage, archives committed objects, validates a candidate, and atomically publishes the immutable snapshot; a concurrent publisher winning the same commit path is accepted only after the winning snapshot validates.
- `CatalogStore` persists sorted strict TOML records through same-directory temporary files and atomic rename.

## Data & control flow

1. Add validates repository trust input, repository/ref grammar, and local Catalog name, then acquires and validates one commit snapshot.
2. The service derives a portable `CatalogRecord` from `ctxindex-catalog.json` and atomically persists it after local-name and Catalog-ID uniqueness checks.
3. Refresh repeats acquisition and changes only the Catalog pin. List/show/install can request that refresh first, while stored-snapshot reads do not invoke Git.
4. Install separately validates execution trust, persisted record/manifest/source identity, loaded definition identity, and the candidate against the caller's complete runtime registry before atomically switching installed provenance. Only exact prior Catalog provenance is replaceable; built-in and explicit-path identity conflicts fail before persistence.
5. Persisted `snapshot_acquired_at` records pin age provenance. Startup consumers derive `data/catalogs/<name>/<commit>` from installed records without refresh; uninstall and Catalog removal change metadata only and retain snapshots.

## Integration points

- Exported as `@ctxindex/core/catalog` and through the core root barrel.
- Uses canonical `configDir()` / `dataDir()` ownership from `paths/` and the shared Extension import/registry validation seam.
- Consumed by CLI Extension handlers and the Extension loader; no provider Adapter or authentication authority enters this module.
