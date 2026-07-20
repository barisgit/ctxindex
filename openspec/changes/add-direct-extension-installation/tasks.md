## 1. Dependency and target contract

- [x] 1.1 Rebase or fast-forward this branch onto the completed #62 Extension SDK change and verify its manifest-entry, namespace collector, exact-root selector, complete candidate registry, local OAuth App collision, and offline loader seams are available unchanged.
- [x] 1.2 Add failing Core tests for explicit `npm`/`git`/`local` target discrimination, package-manager grammar delegation, credential rejection, safe requested-target projection, and working-directory-independent normalized local origins.
- [x] 1.3 Implement public/internal direct target and provenance types plus parse/sanitize helpers; run focused tests, Core typecheck, lint, and redaction checks.

## 2. Strict records and immutable materializations

- [ ] 2.1 Add failing tests for versioned strict record parsing, derived content-addressed paths, npm version/integrity, Git commit, local snapshot digest, dependency/materialization digest, and rejection of credentials, unknown fields, or persisted managed absolute paths.
- [ ] 2.2 Add failing filesystem tests for same-filesystem staging, fsync-before-publish, atomic record replacement, identical-digest races, conflicting concurrent writers, rollback, bounded orphan cleanup, and referenced-materialization retention.
- [x] 2.3 Implement direct record storage, managed paths, lifecycle locking, immutable publication, and unreferenced-only garbage collection; run focused storage/concurrency tests and `git diff --check`.

## 3. Bun package materialization

- [ ] 3.1 Add local npm-registry, Git-repository, and filesystem-package fixtures with ordinary runtime dependencies, mutable versions/refs/content, multiple exported Extension roots, embedded-credential negatives, and lifecycle-script/trusted-dependency assertions.
- [ ] 3.2 Add failing materializer integration tests for argv-safe pinned Bun execution, exact resolved metadata, dependency locks, local snapshotting without symlinks, bounded output/cancellation/timeouts, credential-free failures, and cleanup.
- [x] 3.3 Implement the injected package-materializer interface and Bun adapter without shell interpolation or Extension dependency resolution; run focused fixture tests, package-dependency verification, architecture lint, and Bun 1.3.14 compatibility checks.

## 4. Atomic install and update

- [ ] 4.1 Add failing service tests proving install stages before state, requires exact Extension id, selects one root from all declared entries, reuses the common collector, includes built-in/explicit/Catalog/direct roots plus local OAuth Apps in complete validation, and rejects an existing direct id.
- [ ] 4.2 Add failing update tests proving stored-target reuse, explicit-only resolution, idempotent same-content behavior, per-id replacement, sibling-root independence, serialized mutation, and preservation of the prior pin across acquisition/import/selection/validation/conflict/publication failures.
- [x] 4.3 Implement Core install/update lifecycle orchestration and safe inventory projections; run focused Core/registry/OAuth App/loader tests and typecheck.

## 5. Offline startup and degraded loading

- [ ] 5.1 Add failing loader tests for strict direct-record discovery, derived pinned roots, integrity verification, generic provenance, no package-manager/network/original-local-path reads, relocated data roots, and per-Extension degradation for missing/corrupt/invalid pins.
- [x] 5.2 Route valid direct packages through the common manifest-entry/namespace/graph/complete-registry path, preserve unrelated candidates and Source-owned data on failure, and run focused loader/degraded-search/Source availability tests.
- [ ] 5.3 Add an egress guard proving startup and every read/operation command remain offline with direct records present; run network-egress and no-side-effect gates.

## 6. Guarded uninstall

- [ ] 6.1 Add failing post-removal candidate tests for exact Adapter availability, deterministic blocking Source inventory, alternate-origin satisfaction, zero mutation on guard failure, and forced preservation of Sources, Resources, Artifacts, Accounts, Grants, OAuth Apps, and sync history.
- [x] 6.2 Implement normal and forced uninstall with atomic activation-record removal and unreferenced-only materialization cleanup; run focused Source/registry/storage tests.

## 7. Deterministic CLI and compiled proof

- [x] 7.1 Add failing parser/handler/formatter tests for `extensions install <npm|git|local> <target> --extension <id>`, `update`, unified `list`, and `uninstall [--force]`; prove parser-level failures precede filesystem/package/import effects and Catalog selectors remain distinct.
- [x] 7.2 Implement thin CLI delegation, trust notice on stderr before acquisition/import, one valid deterministic JSON document on stdout, credential-free provenance, blocking Source output, and stable direct lifecycle errors/exits; run CLI thinness, Citty, no-prompts, redaction, and zero-side-effect checks.
- [ ] 7.3 Extend the relocated compiled e2e to install local npm/Git/local fixtures, restart with network/package-manager/origin access disabled, explicitly update mutable inputs, and exercise blocked plus forced uninstall outside the project tree.

## 8. Doctrine and final verification

- [x] 8.1 Promote applicable doctrine into `openspec/specs/extension-installation/implementation.md`, `extension-loading/implementation.md`, `cli-surface/implementation.md`, and `error-taxonomy/implementation.md`; sync behavioral deltas and refresh affected codemaps plus `SYSTEM.md` using their owning skills.
- [ ] 8.2 Run every focused package/e2e gate, `bun run ci`, `bunx openspec validate --all --strict`, cartography no-drift, `git diff --check`, and `openspec-verify-change` before archive.
