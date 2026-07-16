# Charter Report

## C1. Public definitions and registries drive the runtime

- Result: Passed.
- Public seam: `packages/extension-sdk/src/index.ts` defines versioned Profile, Adapter, Extension, auth, capability, operation, and Action contracts with const-generic factories and no runtime dependency on core.
- Runtime enforcement: `packages/core/src/registry/` validates definitions, `(id, version)` uniqueness, optional Action bindings, capability/operation consistency, unknown Profile versions, and atomic Extension registration.
- Derived vocabulary: `packages/core/src/registry/describe.ts` builds kinds, aliases, fields, formats, config schemas, capabilities, and Actions from loaded registries; its fake-Profile test proves the output changes without parallel declarations.
- Verification: `work/slice-1-gate.txt` records passing typecheck, lint, 181 tests, and the Bun compiled-extension regression.

## C2. Compiled ctxindex loads trusted external TypeScript Extensions

- Result: Passed.
- Loading seam: `packages/core/src/extension/loader.ts` imports configured trusted TypeScript factories, supplies the public authoring host, and activates definitions only through validated atomic registries.
- Conflict and invalidation behavior: built-ins load first; conflicting or invalid external Extensions produce path-scoped diagnostics without partial activation.
- Runtime isolation: `packages/extension-sdk/src/index.ts` declares capability-specific Sync, Search, Retrieve, Download, and Action contexts; compile-time tests prevent cross-capability access.
- Disappearance semantics: availability reconciliation requires an explicit complete built-ins list, preserves Sources and materialized rows, marks genuinely missing adapters unavailable, and recovers returning adapters to idle.
- Compiled regression: `scripts/verify/ci.sh` now runs the retained D3 check, proving Bun 1.3.14 loads external TypeScript, relative TypeScript imports, and Extension-owned dependencies after relocation.
- Verification: `work/slice-2-gate.txt` records 190 passing tests, one skipped live-provider test, typecheck, lint, focused loader/SDK checks, and D3.

## C3. Fresh generic storage enforces exact Realm and Source semantics

- Result: Passed.
- Fresh schema: generic Realms, Sources, Grants, Resources, typed field index rows, chunks/FTS, Relations/resolutions, sync locks/runs/cursors, and Artifact metadata replace prototype domain tables.
- Identity and deletion: strict canonical Refs preserve opaque suffixes; synced deletion tombstones while eviction removes rows; unavailable Extensions remain locally readable and provider operations fail explicitly.
- Atomicity: global sync lock ownership, data/cursor transaction boundaries, failed-run persistence, relation projection, and exact Realm/Grant behavior are covered by focused tests.
- Verification: `work/slice-3-gate.txt` records 51 focused tests, 198 passing full-suite tests with one live skip, 10 integration tests, typecheck, lint, strict OpenSpec validation, and diff checking.

## C4. Gmail discovery and retrieval use the generic contract

- Result: Passed.
- Registry path: `communication.message` and declarative Gmail/local Adapters load through public registries; Source setup and provider contexts authorize only the Source-linked compatible Grant.
- Search and get: typed local and remote search share one result envelope, stable Refs, planner routing/explain/warnings, partial materialization, complete retrieval hydration, tombstone handling, and cache reuse.
- Provider proof: mocked binary CLI tests cover Gmail search/get with no live traffic; the isolated human checkpoint then performed one bounded read-only live search and exact get against the explicit Gmail Source with GET-only provider operations.
- Verification: `work/slice-4-gate.txt` contains redaction-safe mocked and live-read evidence.

## C5. Threads traverse generic Relations

- Result: Passed.
- Vocabulary: Profile-owned conversation and parent natural keys preserve distinct Resource identity while allowing cross-Source RFC Message-ID joins.
- Traversal: generic local-only thread closure handles out-of-order arrival, bidirectional parent traversal, deterministic parent choice, cycle safety, tombstones, trees, and flat fallback.
- Verification: `work/slice-5-gate.txt` records focused Relation/thread tests, mocked binary CLI out-of-order Gmail proof with zero provider calls during traversal, 325 passing full-suite tests, typecheck, lint, D3, and diff checking.

## C6. Artifacts and exports are managed and observable

- Result: Passed.
- Managed bytes: ArtifactStore provides streamed SHA-256 CAS writes, deduplication, integrity checks, safe output copies, and logical/physical disk accounting.
- Lazy provider access: Gmail retrieval exposes Profile-owned descriptors; downloads use the Source-linked Grant, cache by stable Artifact Ref, and avoid provider I/O on hits.
- Retention: the sole `cached` policy retains bytes until explicit `purge artifacts`; purge removes metadata plus managed/orphan/temp/quarantine bytes while preserving Resource descriptors for re-download.
- Export: core always provides deterministic validated-payload JSON; `communication.message` declares pure injection-safe CRLF EML rendering without embedding Artifact bytes; unsupported choices derive from the exact Profile registry entry.
- Verification: `work/slice-6-gate.txt` records 107 focused tests, 419 passing full-suite tests with one live skip, typecheck, lint, strict OpenSpec, D3, and diff checking.

## C7. Gmail Draft Actions are typed, reversible, and cannot send

- Result: Passed.
- Generic contract: public Profile Action schemas and Adapter bindings drive registry-derived describe/run behavior; core validates complete input before Source authorization or provider I/O and materializes normalized complete Action output at a stable Ref.
- Gmail boundary: only reversible Draft create and complete-replacement update are bound. Draft identity uses the immutable provider Draft id; update preserves the Ref while replacing content and the embedded provider Message id. No send or irreversible Action exists.
- Negative and mocked proof: invalid/header-injection input performs zero provider I/O or storage writes; the compiled binary performs exactly one mocked POST and one PUT, reuses the cached replacement, and records no send path. OAuth request recording redacts token bodies.
- Live proof: after explicit approval, the isolated dual-scope Source performed one harmless self-addressed Draft create and one update. The user confirmed the updated Draft in Gmail and explicitly confirmed nothing was sent.
- Verification: `work/slice-7-mocked-gate.txt` records 532 passing full-suite tests with one live-token skip plus focused, integration, typecheck, lint, D3, strict OpenSpec, and diff checks; `work/slice-7-live-draft.txt` contains redaction-safe Human-checkpoint evidence.

## C8. Local directories use the same generic Resource path

- Result: Passed.
- Profile and Adapter: the public `file@1` Profile owns strict vocabulary, typed fields, search projection, and bounded chunking; `local.directory` binds it through the public registry and emits complete generic sync Resources.
- Safety and identity: deterministic ignore handling, bounded no-follow reads, binary/oversize/race/path warnings, strict cursor ordering, and stable `ctx://<SOURCE>/file/<encoded-path>` identity cover unchanged, modification, rename, deletion, and transient uncertainty without leaking absolute paths.
- Generic path: the CLI invokes public core sync orchestration; binary tests prove the same search/get/StoredResource envelope as Gmail, no local-directory imports in generic CLI/core paths, no provider egress, and no domain-specific tables.
- Verification: `work/slice-8-gate.txt` records local integration and binary CLI gates, D3 relocation, typecheck, lint, 592 passing full-suite tests with one live-provider skip, strict OpenSpec validation, and diff checking.

## C9. An external tenders Extension proves the public seam

- Result: Passed.
- External authoring: `examples/tenders-extension/` default-exports a host-factory Extension using only type-only public SDK contracts plus relative Extension-owned code. It defines `enarocanje.tender@1` and `enarocanje.fixture@1` without entering built-ins or importing core internals.
- Compiled boundary: the real CLI embeds its canonical ordered SQL migration manifest, initializes after relocation, loads the trusted TypeScript path explicitly, and runs generic sync/search/get from `/` with stable Refs and no tender-specific command, envelope, hook, or table.
- Disappearance: Adapter availability is derived from exact loaded `(id,version)` and remains separate from persisted sync status. Removing the Extension leaves Resources searchable/gettable with degradation warnings, unavailable sync exits 50, and restoring the path recovers availability without mutating Resource identity or historical sync state.
- Verification: `work/slice-9-gate.txt` records public-import boundary tests, the relocated compiled-binary full lifecycle, D3's own-dependency relocation proof, typecheck, lint, 598 passing full-suite tests with one live-provider skip, strict OpenSpec validation, and diff checking.
