## Context

The redesigned Extension SDK makes an Extension an ordinary trusted package root: `package.json` declares `ctxindex.extensions` entry modules, entry namespaces export plain Extension values, and core owns manifest-entry resolution, collection, exact root selection, complete-registry validation, and atomic activation. Existing explicit-path and Catalog acquisition can feed those source-neutral seams, but persistent direct use still requires a Catalog or a manually maintained path.

Direct installation must accept ecosystem package targets without making ctxindex a package resolver. It also must keep ordinary startup offline, preserve the existing in-process trust boundary, remain deterministic after mutable npm ranges, Git refs, or local working trees change, and preserve Source-owned data when code is removed. Authors, operators, automation, and Extension-loading diagnostics all depend on the resulting lifecycle and provenance being explicit.

## Goals / Non-Goals

**Goals:**

- Install one exact Extension root directly from an npm, Git, or local package target without a Catalog.
- Delegate dependency and package-target resolution to Bun's package manager, then reuse the common package-entry, collector, selector, and complete-registry seams.
- Pin every successful install or update to an immutable ctxindex-managed materialization with generic requested and resolved provenance.
- Keep startup and ordinary Extension loading offline.
- Provide atomic per-Extension install, update, inventory, and guarded uninstall behavior.
- Make the explicit install or update invocation the non-interactive trust grant for arbitrary in-process Extension code.

**Non-Goals:**

- A marketplace, Catalog replacement, hosted discovery, automatic update, background refresh, or startup acquisition.
- An Extension dependency graph, automatic installation of sibling Extension roots, or ctxindex-owned package dependency resolution.
- Sandboxing, signatures, code review, malware detection, or a claim that definition validation makes code safe.
- Provider setup, automatic Source creation, migration of Source/Resource data, or removal of Catalog and explicit-path loading.
- Overriding package-manager lifecycle-script protections or persisting registry/Git credentials.

## Decisions

1. **Direct targets are explicitly classified.** The direct CLI accepts `npm`, `git`, or `local` plus one package-manager target. Classification is never guessed from punctuation or filesystem state. npm targets use Bun's npm package-spec grammar and may contain a version or range; Git targets use Bun's Git package-spec grammar and may contain a ref; local targets are package directories and may be relative to the invoking working directory or absolute. A relative local target is resolved once to a normalized absolute origin path that later updates reuse independently of their working directory. Embedded URL credentials are rejected; ambient package-manager credential configuration may be used but is never copied into installation provenance.

2. **The command invocation is the trust grant.** `extensions install` and `extensions update` are explicit operator actions that authorize acquisition, package evaluation, entry import, and arbitrary Extension module code in the ctxindex process. They do not prompt and do not require a redundant `--trust` flag. No configuration file, startup path, listing command, or Catalog discovery may create a direct trust grant. Help and failure text state that validation is a correctness boundary, not a sandbox.

3. **Bun owns the package graph.** Each candidate is materialized through the pinned Bun package manager in isolated staging storage. Bun resolves ordinary package dependencies and exact imports. ctxindex neither interprets an Extension dependency declaration nor installs other exported Extension roots as dependencies. The installer does not add packages to trusted-dependency configuration or weaken Bun's lifecycle-script policy.

4. **Mutable inputs resolve only during explicit lifecycle commands.** Install and update may contact registries or Git and may read a local working tree. A successful candidate records an exact npm version and integrity, exact Git commit, or local content digest together with a resolved dependency lock/materialization digest. The complete runnable package tree is published as immutable managed storage. Startup never re-resolves the requested target and never reads the original local path.

5. **Provenance is source-generic and credential-free.** One direct-install record owns the stable Extension id, source kind, sanitized requested target, exact resolved identity, integrity/content digest, materialization digest, and installation/update time. Source-specific optional fields may refine the resolved identity; local provenance retains its normalized origin path for explicit future updates, but the lifecycle does not persist a Catalog-shaped record. Absolute managed materialization paths are derived rather than persisted. Inventory never exposes credentials or package-manager authentication state.

6. **Exact Extension selection follows acquisition.** A package may declare multiple entry modules and export multiple Extension roots. The command always requires `--extension <id>`, collects the package through the common manifest and collector seams, and selects exactly that root. Sibling roots are not activated implicitly. Installing sibling roots from the same target creates independent lifecycle records; physical content may be deduplicated only as an internal storage optimization.

7. **Install and update are validate-then-switch.** Acquisition, import, exact selection, and validation of the complete runtime candidate occur in staging. Install fails if the stable Extension id already has a direct record. Update starts from the record's stored requested target and replaces only that Extension after the new complete candidate validates. Any failure leaves the old record, materialization, and active candidate unchanged. State publication is serialized and atomically switches the record only after the immutable materialization exists.

8. **Startup is offline and failure is degraded per Extension.** Startup reads strict direct-install records, derives their immutable materializations, verifies required pinned material, and feeds valid packages to the common loader. It performs no package-manager, registry, Git, or original-local-path access. A missing or corrupt materialization yields a provenance-bearing Extension diagnostic and unavailable dependent Sources while unrelated Extensions continue loading.

9. **Uninstall is guarded by post-removal availability.** A Source blocks normal uninstall when removing the selected Extension would make that Source's Adapter unavailable. The guard is based on the candidate registry after removal, so an independently valid remaining origin can continue satisfying the Source. `--force` removes the direct activation record and unreferenced materialization while preserving Sources, Resources, Artifacts, Grants, and other materialized data; affected Sources remain configured but unavailable.

10. **Catalogs and explicit paths remain independent origins.** Direct installation neither creates nor requires a Catalog record. All origins converge only at collection and complete-registry validation. Direct provenance does not gain priority, shadow another origin, or permit a same-id winner by install order. Existing conflict rules remain order-independent.

## Risks / Trade-offs

- [Explicit trust permits malicious package code and top-level side effects] → State the boundary in help/output, require an explicit install or update command before import, and never imply that schema validation is a security sandbox.
- [Mutable npm, Git, and local targets reduce reproducibility] → Resolve only during explicit commands and execute only the immutable pinned materialization afterward.
- [Package-manager behavior or registries can vary] → Pin Bun, capture resolved identity/integrity and the runnable materialization digest, and test with local npm/Git/local fixtures.
- [Ambient credentials may be needed for private packages] → Let Bun use its normal external configuration while rejecting credentials in targets and never persisting authentication material.
- [Per-Extension materializations can duplicate package bytes] → Permit content-addressed internal deduplication without coupling lifecycle records or introducing Extension dependencies.
- [Forced uninstall leaves configured but unusable Sources] → Preserve all data, surface exact unavailable diagnostics, and require explicit force after listing dependent Sources.
- [Concurrent install/update/uninstall could publish stale state] → Serialize lifecycle record mutation and use staged immutable publication plus atomic record replacement.

## Migration Plan

The repository is pre-alpha. Add a new strict direct-install record set and managed materialization root with no compatibility alias or migration from Catalog installed records. Existing Catalog installations and explicit-path configuration remain unchanged and continue through the shared loader. On first use, no direct-install state exists. Invalid or incomplete new records fail closed with diagnostics and are never rewritten implicitly. Implementation lands only after the dependent SDK redesign's manifest, collector, exact-selection, complete-registry, and versionless Extension identity contracts are available.

## Open Questions

None.
