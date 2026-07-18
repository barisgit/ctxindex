## 1. Strict Catalog contracts and persistence

- [x] 1.1 Add failing core tests for strict manifest/TOML schemas, duplicate identities, deterministic bounds, normalized contained paths, and portable snapshot derivation; implement the smallest contracts and persistence needed to pass them.
- [x] 1.2 Run the focused Catalog schema, path, and persistence test files as the Slice gate.

## 2. Trusted Git acquisition and Catalog lifecycle

- [x] 2.1 Add failing local-fixture tests for repository policy, full-ref/OID resolution, committed-object snapshots, disabled ambient Git behavior, atomic add/refresh, unique Catalog identity, refresh/install independence, and referenced removal; implement provider-neutral acquisition and CatalogService lifecycle methods.
- [x] 2.2 Run the complete core Catalog service tests plus module-architecture verification as the Slice gate.

## 3. Install provenance and Extension loading

- [x] 3.1 Add failing tests for install identity validation, separate trust boundary inputs, idempotent same provenance, atomic valid replacement, uninstall retention, and strict installed provenance; implement install/uninstall behavior through the existing Extension validation seam.
- [x] 3.2 Add failing loader/listing tests for installed provenance, deterministic provenance output, missing/invalid snapshot diagnostics, offline startup, and preserved stored state; implement installed-provenance loading.
- [x] 3.3 Run focused install, loader, registry formatting, and compiled external Extension tests as the Slice gate.

## 4. Deterministic CLI and relocated binary

- [x] 4.1 Add failing parser and command tests for Catalog add/list/show/refresh/remove and Extension install/uninstall, including exact selectors, independent `--trust`, JSON/text determinism, usage exit 2, and thin service delegation; implement the CLI surface.
- [x] 4.2 Add a local committed Git fixture e2e covering the complete Catalog workflow and relocated compiled CLI while proving non-acquisition commands remain offline.
- [x] 4.3 Run CLI unit/e2e tests, no-prompts, thin-CLI, architecture, and compiled relocation checks as the Slice gate.

## 5. Doctrine and final verification

- [x] 5.1 Refresh affected codemaps via cartography and refresh `SYSTEM.md` via system-reference.
- [x] 5.2 Promote applicable doctrine into canonical `extension-catalogs`, `extension-loading`, and `cli-surface` implementation sidecars.
- [x] 5.3 Run `bun run ci`, `bunx openspec validate --all --strict`, and `openspec-verify-change`; resolve every failure without archiving the change.
