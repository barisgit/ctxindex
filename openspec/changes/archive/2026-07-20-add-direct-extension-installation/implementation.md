## Capability Implementation Targets

- `extension-installation` → `openspec/specs/extension-installation/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`
- `error-taxonomy` → `openspec/specs/error-taxonomy/implementation.md`

## Module Ownership

`@ctxindex/core` owns direct-install target types, strict provenance schemas, lifecycle services, managed paths, atomic record publication, Source dependency guards, and the package-materialization effect interface. The Bun-backed materializer is a platform adapter behind that injected interface; callers never assemble shell commands or interpret package-manager output.

The existing Core Extension package boundary remains authoritative for `ctxindex.extensions` resolution, module import, root collection, exact Extension selection, complete candidate validation, and degraded diagnostics. Direct installation feeds immutable package roots and safe generic provenance into those seams; it does not create a second loader or registry.

The CLI Extension command group owns parsing and deterministic text/JSON rendering only. Runtime composition injects the Core lifecycle service, working directory, clock, filesystem boundary, process runner, and active complete-registry inputs. `@ctxindex/extension-sdk` and Extension packages remain unaware of installation records and acquisition origins.

## Interfaces and Data Flow

Core exposes discriminated `npm`, `git`, and `local` target inputs, a credential-free `DirectExtensionInstallationRecord`, safe inventory projections, and install/update/uninstall service methods. Target parsing and sanitization occur before the materializer effect. The materializer receives argv-safe structured input and returns a staging package root plus resolved package-manager metadata; it never receives shell source text.

Install resolves a target into isolated staging storage, resolves declared dependencies with pinned Bun, invokes the common package-entry/collector/selector pipeline, validates the resulting complete candidate together with every active origin and local OAuth App identity, then publishes immutable material and atomically publishes one record. Update follows the same path from the stored source kind and requested target and switches only after validation. Failure cleans staging and leaves published state unchanged.

Startup parses records strictly, derives content-addressed materialization paths, verifies their recorded digest, and supplies valid package roots to the common loader with generic provenance. Record parsing, integrity, import, collection, and validation failures become per-Extension diagnostics; they do not trigger acquisition and do not prevent unrelated candidates from being evaluated.

Uninstall computes the complete post-removal candidate before mutation and asks Core Source ownership for every Source whose exact Adapter would become unavailable. The non-forced path returns a typed guard failure. The forced path atomically removes the activation record, then garbage-collects only materializations unreferenced by any record.

## Storage and State

Direct installation state lives outside provider SQLite because Extension composition precedes database service construction. A versioned, strict record document is stored under the ctxindex data root; immutable content-addressed package trees live under a sibling managed materialization root. Records contain stable Extension id, source kind, sanitized requested target, resolved identity, integrity/content digest, materialization digest, and timestamps. Managed absolute paths are always derived.

Candidate staging uses a temporary directory on the same filesystem as the managed root. Publication writes and fsyncs the immutable materialization before an atomic record-file replacement. Lifecycle mutation is serialized by the existing bounded file-lock discipline or a direct-install-specific lock with the same timeout/error behavior. Losers in concurrent publication fail cleanly or observe an identical already-published digest; they never overwrite a different candidate.

Local acquisition snapshots package content and dependencies rather than retaining a symlink. Its normalized origin path is stored only as an update input; startup never follows it. npm and Git resolution retain exact version/integrity or commit metadata returned by the materializer. Staging, lock, and orphan cleanup are bounded and must not delete a materialization still referenced by a published record.

## Security and Compatibility

Install and update are the only trust-granting paths. Their warning is emitted before package evaluation, while validation and diagnostics never claim to sandbox trusted code. Read-only startup, list, status, and uninstall do not invoke Bun, Git, npm, lifecycle scripts, or original local paths.

Target validation rejects embedded URL credentials and sanitizes provenance before logging, errors, inventory, or JSON output. Package-manager credentials remain ambient to the child process and are never parsed or persisted. Process execution uses explicit executable and argv arrays, bounded output, cancellation, and timeouts; no target is interpolated into a shell command. Diagnostic causes are redacted at the Core boundary.

The Bun adapter preserves the repository's pinned Bun version and default lifecycle-script/trusted-dependency policy. Direct records are new pre-alpha state with no aliases for Catalog installations or explicit paths. Invalid record versions fail closed and require explicit repair/reinstall rather than ambient rewriting. Catalog, explicit-path, built-in, and direct roots retain equal conflict semantics and no origin priority.

## Verification

Focused Core tests cover target classification/sanitization, normalized local origins, strict record parsing, content digests, atomic publication and rollback, concurrent mutation, offline record loading, integrity degradation, exact-root selection, complete-registry conflicts including local OAuth Apps, post-removal Source guards, forced preservation, and unreferenced-only garbage collection.

Materializer integration tests use local registry, Git, and filesystem fixtures without external credentials. They prove exact npm/Git/local pins, ordinary dependency resolution, lifecycle-policy preservation, credential-free provenance, mutable-input update, and no startup acquisition. CLI tests cover parsing-before-effects, trust notice on stderr with valid JSON stdout, deterministic inventory, stable exits, and Catalog/direct command separation.

The relocated compiled e2e gate installs each local fixture kind, restarts with package-manager/network/origin access denied, validates explicit update, and exercises guarded and forced uninstall. Cross-cutting gates are Core/CLI typechecks, package-dependency and architecture checks, redaction/egress checks, `bun run ci`, strict OpenSpec validation, cartography, and `openspec-verify-change`.

## Promotion Notes

- Promote direct lifecycle ownership, materializer injection, immutable record/materialization state, atomic publication, and verification doctrine into `openspec/specs/extension-installation/implementation.md`.
- Extend `openspec/specs/extension-loading/implementation.md` with strict offline direct-record loading, derived materialization paths, common collector/registry composition, and per-Extension degraded diagnostics.
- Extend `openspec/specs/cli-surface/implementation.md` with thin direct lifecycle parsing/rendering, trust-notice stderr behavior, and deterministic safe provenance projections.
- Extend `openspec/specs/error-taxonomy/implementation.md` with typed lifecycle-stage failures, stable exit mapping, sanitized causes, and rollback boundaries.
