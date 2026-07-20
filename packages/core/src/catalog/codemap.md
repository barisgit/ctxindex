# packages/core/src/catalog/

## Responsibility

Owns provider-neutral trusted Git Catalog registration, immutable snapshot acquisition, strict manifest and provenance persistence, and explicit Extension install/uninstall lifecycle.

## Design / patterns

- `CatalogService` is the application-service facade for Catalog add/list/show/refresh/remove and Extension install/uninstall; read/install callers explicitly select refresh or stored-snapshot behavior.
- `schema.ts` defines closed Zod contracts and deterministic manifest, entry, path, and setup bounds; `paths.ts` enforces lexical and realpath containment and requires each source path to identify a package directory.
- `repository.ts` validates public credential-free HTTPS or absolute local repositories and exact full refs/OIDs before effects.
- `git.ts` is the hardened system-Git acquisition adapter. It fetches one ref into temporary bare storage, archives committed objects, validates a candidate, and atomically publishes the immutable snapshot; a concurrent publisher winning the same commit path is accepted only after the winning snapshot validates.
- `CatalogStore` persists sorted strict TOML records through same-directory temporary files and atomic rename.

## Data & control flow

1. Add validates repository trust input, repository/ref grammar, and local Catalog name, then acquires and validates one commit snapshot.
2. The service derives a portable `CatalogRecord` from `ctxindex-catalog.json` and atomically persists it after local-name and Catalog-ID uniqueness checks.
3. Refresh repeats acquisition and changes only the Catalog pin. List/show/install can request that refresh first, while stored-snapshot reads do not invoke Git.
4. Install separately validates execution trust and persisted record/manifest/source identity, then delegates package manifest entry resolution, exported-root collection, and exact Extension-id selection to the source-neutral Extension loader. Arbitrary package evaluation causes are discarded at that boundary; the selected candidate is validated with active roots and local OAuth App identities through the complete candidate registry before installed provenance changes.
5. Persisted `snapshot_acquired_at` records pin age provenance. Startup consumers derive `data/catalogs/<name>/<commit>` from installed records without refresh; uninstall and Catalog removal change metadata only and retain snapshots.

## Integration points

- Exported as `@ctxindex/core/catalog` and through the core root barrel.
- Uses canonical `configDir()` / `dataDir()` ownership from `paths/` and the shared `ctxindex.extensions` import/collection/selection and registry validation seams.
- Consumed by CLI Extension handlers and the Extension loader; no provider Adapter or authentication authority enters this module.
