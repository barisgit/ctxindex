# Charter: Deepen ctxindex module architecture

## Objective

Deepen ctxindex module architecture across Adapters, Profiles, the public Extension SDK, CLI, and core by restoring domain ownership/locality, deleting dead prototype code and unused dependencies, and adding durable architecture verification while preserving all V1 public behavior, storage, provider I/O, package exports, and exit codes.

## References

- `CONTEXT.md`
- `SPEC.md`
- `IMPLEMENTATION.md`
- `docs/design/2026-07-13-context-access-layer.md`
- `openspec/changes/deepen-module-architecture/`
- `.slim/cartography.json` and hierarchical `codemap.md` files

## Scope

In scope: internal Module ownership and layout, private Interface depth, test locality, dead/prototype code deletion, package entrypoints and manifests, architecture checks, implementation guidance, and codemaps across `apps/` and `packages/`.

Out of scope: V1 product behavior changes; storage migrations; new Profiles, Adapters, Actions, or auth providers; OAuth/search/materialization redesign; compatibility aliases for private file moves; splitting cohesive deep stores/planners/registries solely by line count; and live provider traffic.

## Criteria

### C1. Source Adapter ownership is visible in the tree

Each bundled Source Adapter owns its definition, configuration, provider/filesystem helpers, operations, Actions, and focused tests under one named Module. The Adapters package root contains only package/Extension composition concerns rather than Gmail implementation files.
Status: pass — owned provider Modules, discovery-based architecture contract, and 735-test gate evidenced in work/slice-1-adapter-profile-gate.md

### C2. Extension composition and Profile semantics have one owner

`builtins.ts` only bundles Profile and Adapter definitions; Gmail configuration no longer lives there. Provider-neutral message/file semantics and their registry/path contracts live in `packages/profiles`, while provider wire behavior remains in Adapters.
Depends: C1
Status: pass — builtins is composition-only; Profile registry/path contracts moved to packages/profiles and provider MIME remains Adapter-owned

### C3. The public Extension SDK is deep and stable

SDK references, Profile contracts, operation contexts, Adapter contracts, and Extension factories are internally coherent Modules behind the unchanged `@ctxindex/extension-sdk` Interface. Existing symbol exports, generic inference, host-provided factories, and external compiled Extension behavior remain intact.
Depends: C2
Status: pass — exact 43-symbol surface, private SDK Modules, external Extension e2es, D3 relocation, and independent approval evidenced in work/slice-2-extension-sdk-gate.md

### C4. CLI command composition is uniformly thin

Every production Citty command file is automatically discovered by the thin-command gate and delegates parsing/workflow/presentation to owned Modules. Action and Artifact no longer hide full workflows in command declarations, and progressive registry help/detail/JSON output remains unchanged.
Depends: C3
Status: pass — Action/Artifact workflow owners and automatic 18-command thin gate evidenced in work/slice-3-cli-presentation-gate.md

### C5. Registry presentation has explicit private seams

Registry selection/projection, JSON-Schema detail rendering, text rendering, and Markdown rendering are separate private Modules behind the existing formatter Interface. Requiredness, constraints, local schema fallbacks, examples, JSON cardinality, and deterministic order remain covered.
Depends: C3
Status: pass — projection/schema/text/Markdown Modules and exact output gates evidenced in work/slice-3-cli-presentation-gate.md

### C6. Core contains no forbidden prototype storage path

The legacy prototype sync-operation contract is absent. Source removal relies on the generic core schema's declared cascades and demonstrably removes every Source-owned generic row while preserving unrelated Sources, with no dynamic support for Adapter-owned tables forbidden by `SPEC.md` §§3b and 8.
Status: pass — generic Source graph/FTS cascade and unrelated-Source preservation contract; prototype sync union and dynamic Adapter-table sweep removed

### C7. Core infrastructure Modules expose one clear Interface

Logger redaction and rotation/compression implementation have private owned Modules behind the existing logger Interface. Secrets and core capability entrypoints have one canonical implementation location without empty or redundant root shims, while declared package subpaths remain stable.
Depends: C6
Status: pass — logger redaction/rotation owners, canonical Secrets Interface, direct capability subpaths, and root-shim removal verified by focused contracts

### C8. Dependency direction and manifests are truthful

Workspace package imports follow the intended SDK -> Profiles/core/Adapters -> CLI direction through public seams. Every direct runtime dependency is demonstrably imported by that package's source or tests; moved/deleted prototype dependencies and lockfile entries are pruned by a repeatable verification gate.
Depends: C3, C7
Status: pass — AST-derived import/manifests/direction gate, pruned lockfile, frozen install, build, and complete Slice 5 evidence in work/slice-5-dependency-gate.md

### C9. V1 behavior and safety contracts are unchanged

CLI output/exit taxonomy, storage schema, Gmail request counts/URLs/error behavior, Draft no-send guarantee, Local Directory sync, Artifact handling, auth, search, retrieval, and Extension loading pass their existing unit/integration/e2e contracts. No live provider request is made.
Depends: C1, C3, C4, C6
Status: pass — complete unit/integration/e2e, compiled CLI, D3, typecheck, and lint gates preserve V1 behavior without live provider traffic

### C10. Architecture drift fails automatically

Repository verification discovers new production command files, misplaced built-in Adapter implementation, private deep imports, dependency-direction violations, and unused direct runtime dependencies without maintaining a list of individual implementation filenames.
Depends: C4, C8
Status: pass — automatic command, Adapter locality, public-import, unused-dependency, and dependency-direction checks cover discovered source entrypoints

### C11. Documentation and maps describe the settled architecture

`IMPLEMENTATION.md`, affected codemaps, storage comments, and package descriptions use current Profile/Adapter/Extension terminology and describe actual ownership. Incremental cartography and drift sweep report no unresolved code/document mismatch.
Depends: C1, C3, C4, C7
Status: pending

### C12. The complete reviewed snapshot is releasable

Focused package gates, typecheck, lint, unit/integration/e2e tests, CI architecture scripts, compiled CLI and D3 external Extension proof, database drift checks, strict OpenSpec validation, semantic verification, diff checking, and independent architecture review all pass on the same final snapshot. The OpenSpec change remains active for explicit archive.
Depends: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C11
Status: pending
