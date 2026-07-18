## Capability Implementation Targets

- `extension-catalogs` → `openspec/specs/extension-catalogs/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`

## Module Ownership

Provider-neutral core owns Catalog domain schemas, manifest/path validation, strict TOML persistence, Git acquisition, snapshot publication, install validation, and Catalog lifecycle orchestration. Git and filesystem effects remain behind a `CatalogService` boundary whose defaults derive roots from the canonical ctxindex path resolver and whose constructor accepts roots/effects for isolated tests.

The Extension loader remains the only dynamic-import and registry-activation seam. Catalog install validation and startup loading reuse that seam rather than implementing a second definition validator. Installed provenance is an additional trusted input source after built-ins and explicit configured paths.

The CLI owns only typed argument parsing, usage validation, generated command metadata, deterministic formatting, and delegation to `CatalogService` or the Extension loader. It MUST NOT perform Git, manifest, path, persistence, or install-replacement logic.

## Interfaces and Data Flow

Core exposes strict data contracts for `CatalogManifest`, `CatalogRecord`, `InstalledExtensionRecord`, and their identity/provenance projections. `CatalogService` exposes async `add`, `list`, `show`, `refresh`, `remove`, `install`, and `uninstall` operations with explicit input and result types. A shared exact Extension selector parser may remain CLI-side because it validates syntax only.

`add` validates repository syntax, acquires a candidate commit snapshot, parses and validates the manifest and all bounded paths, checks Catalog identity uniqueness, then atomically publishes the snapshot and Catalog record. `refresh` repeats acquisition against the existing repository/ref and switches only the Catalog record. Temporary acquisition state never becomes visible on failure.

`install` resolves the requested entry from the persisted Catalog pin, validates the snapshot and imports the Extension via the shared authoring host/registry validation seam, compares loaded and manifest identities, then atomically writes installed provenance. `uninstall` removes only that provenance. Read operations load strict persisted records and derive snapshot locations from the current data root.

`loadExtensions` accepts installed provenance (read from the default store when not injected) and imports each derived inline source after explicit configured paths, collecting the same `ExtensionLoadDiagnostic` shape on missing or invalid snapshots. Registry activation remains per-Extension atomic.

## Storage and State

Catalog metadata and installed provenance use separate strict TOML documents under the canonical config directory. Writes use restrictive permissions, same-directory temporary files, and atomic rename. Records contain repository strings, refs, exact commits, manifest metadata, and relative source/setup paths but no absolute snapshot locations.

Immutable snapshots live below the canonical data root at `catalogs/<catalog-name>/<commit>`. Candidate snapshots are created in temporary sibling storage and renamed into place only after validation. Existing snapshots are reused only after their manifest/path validation succeeds; uninstall and Catalog removal never remove snapshot directories.

## Security and Compatibility

Git invocation is non-interactive and hermetic with respect to user configuration: disable system/global repository config, prompts, credential helpers, hooks, filters, submodules, LFS smudge, and external protocols; pass repository/ref arguments without shell interpolation. Archive committed objects rather than copying working trees. Validate HTTPS URL scheme/userinfo/query/fragment/host/literal address or absolute local path before invocation, and revalidate persisted acquisition inputs at the Git boundary.

Manifest parsing uses size-before-read, strict JSON object schemas, and UTF-8 byte bounds. Repository-relative paths are checked lexically and after realpath resolution against the snapshot root; source/setup targets must be committed regular files. Dynamic import still grants full in-process trust and is gated by exact install acknowledgement.

The existing explicit-path Extension configuration and Bun 1.3.14 external TypeScript loading contract remain compatible. Compiled relocation cannot depend on repository-relative imports or a working project tree.

## Verification

Core tests cover strict manifest unknown-field rejection, all bounds, duplicate identities, path normalization and symlink escape, repository policy, hardened Git arguments/environment, committed-object snapshots, strict TOML round trips, atomic failure preservation, refresh/install independence, idempotence, removal guards, and retained snapshots.

Loader tests cover installed provenance, identity mismatch, deterministic provenance listing, missing/invalid snapshot diagnostics, no fetch, and preservation of stored Sources/Resources. CLI parser/unit/e2e tests cover every command, usage exit 2 for trust and selector errors, deterministic text/JSON, offline non-acquisition operations, and local Git fixtures. The relocated compiled Extension e2e gate covers Catalog add/install/startup from an absolute local repository.

Cross-cutting gates remain the module architecture and thin-CLI checks, `bun run ci`, strict OpenSpec validation, refreshed codemaps, refreshed `SYSTEM.md`, and OpenSpec implementation verification.

## Promotion Notes

- Merge the provider-neutral Catalog service ownership, strict persistence/snapshot derivation, hardened system-Git acquisition, and verification doctrine into `openspec/specs/extension-catalogs/implementation.md`.
- Merge installed-provenance input, shared dynamic-import/registry-validation flow, provenance diagnostics, and compiled TypeScript compatibility into `openspec/specs/extension-loading/implementation.md`.
- Merge Catalog parser/formatter/service-delegation boundaries and deterministic local-fixture CLI verification into `openspec/specs/cli-surface/implementation.md`.
