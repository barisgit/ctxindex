# packages/core/src/catalog/

## Responsibility

Owns package-backed Catalog authoring, trusted Git Catalog registration, immutable snapshot acquisition, marketplace discovery, strict replay/provenance persistence, and Catalog-curated Extension installation.

## Design / patterns

- `authoring.ts` evaluates an explicitly trusted package's exact Catalog export, resolves literal and package-backed entries through the direct-install authoring seam, requires each fresh npm source to carry its resolved package identity/version/integrity and each Git source to carry its credential-free repository identity/commit, projects the Catalog's id-keyed entry summaries into inert Marketplace metadata, snapshots content-addressed Bun resolution artifacts, and atomically emits canonical schema-v2 JSON. `requestedTarget` is preserved only as explanatory provenance.
- `CatalogService` is the application-service facade for Catalog add/list/show/search/refresh/remove; reads default to refresh, while callers can explicitly select stored state. Add/refresh stage snapshot acquisition outside the generic lifecycle lock, then re-read and compare the complete originally selected record under the lock before a non-stale write; refresh preserves the stable Catalog id and retains the acquisition timestamp when the exact commit is unchanged. `marketplace.ts` projects deterministic query results with snapshot age and exact source locators.
- `schema.ts` defines closed schema-v2 Zod contracts for generated-package identity, literal/package entries, and replay payloads whose npm package identity or credential-free Git repository identity is mandatory authority alongside the exact version/integrity or commit; `requestedTarget` is non-authoritative explanatory provenance. `paths.ts` enforces containment and verifies each replay lock's bytes and SHA-256 digest.
- `repository.ts` validates public credential-free HTTPS or absolute local repositories and exact full refs/OIDs before effects.
- `git.ts` is the hardened system-Git acquisition adapter. It fetches one ref into temporary bare storage, archives committed objects, validates a candidate, and atomically publishes the immutable snapshot; a concurrent publisher winning the same commit path is accepted only after the winning snapshot validates.
- `CatalogStore` persists sorted strict TOML records through same-directory temporary files and atomic rename.
- `CatalogInstallationService` revalidates configured state against the immutable snapshot, reconstructs the exact replay candidate, and delegates installation to the shared package installer with Catalog curation provenance plus a pre-commit compare-and-swap over the selected Catalog record, commit, and indexed entry.

## Data & control flow

1. Catalog build requires explicit author trust, imports the package's single declared module, exact-selects a Catalog root, rejects duplicate stable ids before any per-entry resolution, and resolves each inline or npm/Git/local package entry into immutable replay metadata plus bounded resolution artifacts. Fresh package materialization must derive npm package identity/version/integrity or credential-free Git repository/commit; the manifest preserves those facts for replay while keeping `requestedTarget` explanatory.
2. The builder sorts entries, writes content-addressed artifacts without replacement, and atomically publishes deterministic `ctxindex-catalog.json`; identical output is a no-op.
3. Add validates repository trust input, repository/ref grammar, and local Catalog name, then acquires and validates one commit snapshot. The service persists its portable record after local-name and Catalog-ID uniqueness checks.
4. Refresh repeats acquisition; list/show/search refresh by default, while stored reads do not invoke Git. Search flattens Catalog entries into stable marketplace results with snapshot age and literal/package locators.
5. Install requires execution trust, revalidates the selected entry against its snapshot, reads the pinned lock artifact, and delegates exact materialization and registry validation to the generic direct-install pipeline while retaining Catalog curation provenance. Exact verification treats the persisted npm package/version/integrity or Git credential-free repository/commit as authority, never the explanatory requested target.
6. Catalog removal serializes its blocker check and configured-record deletion with generic installation. A pending install compares its exact selected snapshot and indexed entry with current configured state under the same lifecycle lock, so removal, refresh, and stale curated commit cannot both succeed. Startup loads generic records offline from content-addressed materializations; snapshots remain retained metadata artifacts.

## Integration points

- Exported as `@ctxindex/core/catalog` and through the core root barrel.
- Uses canonical `configDir()` / `dataDir()` ownership from `paths/`, SDK Catalog definitions, package-entry inspection, and the direct-extension resolver/materializer/store seams.
- Consumed by CLI Catalog/Extension handlers; daemon and Extension startup consume the resulting unified installation records rather than Catalog snapshots directly. No provider Adapter or authentication authority enters this module.
