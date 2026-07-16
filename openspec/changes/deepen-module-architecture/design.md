## Context

V1 behavior is complete, but its implementation accumulated uneven locality during vertical delivery. `packages/adapters/src` places the Local Directory Adapter in one owned directory while Gmail operations live at package root, provider URL code lives under `google-mailbox/`, and `builtins.ts` owns the Gmail configuration schema and both Adapter definitions. The provider API file also retains an unused OAuth client, response schemas, retry logic, and a compatibility export.

The same pattern appears elsewhere in smaller forms: the public Extension SDK is one large source file, registry schema rendering shares one large formatter with projections and two output languages, two CLI commands contain full workflows while the thin-command gate omits them, core retains an unused prototype sync contract and dynamic cleanup for Adapter-owned tables forbidden by `SPEC.md` §§3b and 8, and package manifests still list moved or deleted dependencies.

The accepted package direction and domain ownership remain sound: Profiles own semantics, Adapters own provider I/O, Extensions bundle definitions, core owns orchestration/storage, and the CLI is a thin application Adapter. The refactor must strengthen these seams without changing V1 behavior or inventing abstractions solely to reduce line counts.

## Goals / Non-Goals

**Goals:**
- Make the file tree communicate ownership without repository-wide search.
- Increase Module depth by hiding related implementation behind small existing Interfaces.
- Delete demonstrably unreachable prototype/provider code and unused dependencies.
- Preserve public package seams and all observable V1 contracts.
- Add architecture checks that discover future entrypoints rather than relying on manually curated lists.
- Leave codemaps and implementation guidance accurate enough to prevent the same drift.

**Non-Goals:**
- Redesign OAuth/provider ownership, search routing, Resource materialization, storage, migrations, or V1 CLI output.
- Add a second provider, new Profile, new Adapter capability, or new package export.
- Split cohesive deep Modules such as `ArtifactStore`, `SearchPlanner`, `ExtensionRegistry`, or stores merely because they are large.
- Share Profile EML rendering with Gmail wire-MIME construction; they have different owners and contracts.
- Add compatibility aliases for moved internal files.

## Decisions

### D1. Organize by domain owner, not by file size

A directory is an owned Module when its files change for the same domain reason and can be understood through a small entrypoint. Large cohesive implementations remain intact; mixed-responsibility files split only where the extracted implementation has a clear private Interface.

Rejected: imposing a universal line limit or one-file-per-function convention. That would fragment deep Modules and increase the Interface a maintainer must learn.

### D2. Each Source Adapter owns its complete implementation

`packages/adapters/src/google-mailbox/` will own Gmail configuration, definition, URL routing, response/message helpers, operations, Actions, and focused tests. `local-directory/` will gain its own Adapter definition and integration test. `builtins.ts` will import those two definitions plus Profile definitions and only compose `ctxindexBuiltinExtension`/`CTXINDEX_BUILTIN_EXTENSIONS`.

The dead Google OAuth exchange, unused provider schemas/retry client, and compatibility allowlist export in the current `google-mailbox/api.ts` will be deleted rather than moved. Existing operation response/error behavior remains in the Gmail-owned implementation. Tests owned by a Profile move to `packages/profiles`; cross-Adapter composition contracts remain next to `builtins.ts`.

Rejected: only moving `gmail-*.ts`. That improves appearance but leaves configuration and definition ownership in the wrong Module and preserves dead code.

### D3. Split the Extension SDK internally while retaining one public Interface

The SDK will separate shared references, Profile contracts, provider operation contexts, Adapter contracts, and Extension factories into private source Modules. `src/index.ts` remains the sole package export and re-exports the exact existing symbol set. Type-level factory inference and the external compiled-Extension seam are the compatibility tests.

Rejected: adding public subpath exports. They would enlarge the Interface without giving Extension authors more leverage.

### D4. Deepen CLI presentation and command Modules

Registry projection/selection, JSON-Schema detail rendering, text rendering, and Markdown rendering become sibling private formatter Modules behind the existing `format/registry` Interface. Action and Artifact workflows move out of `commands/` into owned handler Modules; command files retain only Citty declaration and delegation. Shared flag parsing replaces bespoke loops where it preserves exact grammar, and the unused duplicate secrets-store dependency field is removed.

The thin-command gate will discover every production `apps/cli/src/commands/*.ts` file automatically and exclude tests by rule, not allowlist. Existing help, describe JSON cardinality, raw export bytes, diagnostics, and exits remain byte-for-byte covered.

Rejected: applying the command line limit to every CLI implementation file. Parsers, formatters, and workflow handlers can be deep without being composition roots.

### D5. Remove core prototype complexity that contradicts current storage rules

The unreachable `sync/operations.ts` prototype union will be deleted. Source removal will rely on the declared generic schema's foreign-key cascades rather than discovering and sweeping hypothetical Adapter-owned tables, which `SPEC.md` §§3b and 8 forbid. Focused tests will prove all generic Source-owned state is removed and unrelated state remains.

Logger redaction and rotation/compression implementation will move behind private sibling Interfaces while the current logger exports and behavior remain stable. Cohesive stores, planners, registries, and orchestration Modules stay intact.

Rejected: extracting factories around stores or splitting planners by method count. Those add shallow Interfaces without demonstrated alternative implementations or change locality.

### D6. Normalize internal entrypoints and manifest ownership

Core subpath exports will target capability `index.ts` files directly; empty/pure pass-through root shims will be removed, while the declared package subpath names stay unchanged. The Secrets capability index will own its complete existing public surface. Imports inside core will use explicit capability paths where ambiguity would otherwise return.

Direct dependencies unused by a package's source or tests will be removed and the Bun lockfile regenerated. A repository check will compare workspace runtime manifests to bare import specifiers and enforce the established dependency direction: SDK -> Zod; Profiles -> SDK/Zod; core -> SDK; Adapters -> public core/SDK/Profiles; CLI -> public workspace packages.

### D7. Put shared semantics with the Profile that owns them

The normalized relative file-path predicate belongs to `file@1` semantics and will be exported from `packages/profiles`. Local Directory Ref construction will reuse that predicate while preserving its current error Interface. The registry contract test for `communication.message@1` moves from Adapters to Profiles.

Rejected: placing the predicate in core or the SDK. It is neither generic orchestration nor an Extension authoring primitive.

### D8. Verify in dependency order and commit vertical architecture slices

Implementation order is Adapters/Profiles, SDK, CLI, then core/manifests because later slices consume the earlier public seams. Each slice starts from existing behavioral tests, adds only the architecture or ownership assertion needed to make drift observable, runs focused tests/typecheck/lint, and lands independently. The final gate includes all unit/integration/e2e tests, CI architecture scripts, the compiled external Extension spike, strict OpenSpec validation, canonical embedded-migration/schema checks, dependency/codemap drift checks, and an independent architecture review.

## Risks / Trade-offs

- **[Risk] Relative import moves create broad mechanical breakage** -> Move one owned Module at a time, use structural import search, and run its focused tests plus typecheck before continuing.
- **[Risk] SDK file splitting changes inferred generics or runtime factory identity** -> Keep one public barrel, add an exact export/type contract, and run the relocated compiled external Extension proof.
- **[Risk] Simplified Source removal misses generic rows** -> Verify every generic Source-owned table and FTS projection through the public Source Service before deleting the dynamic sweep.
- **[Risk] Logger extraction changes asynchronous rotation or redaction** -> Preserve existing functions and timing, test through `createLogger`, and do not introduce a new logging Interface.
- **[Risk] Dependency pruning removes a dynamically loaded package** -> Include static and dynamic import forms in the manifest check, rebuild the real CLI, and run full e2e/compiled gates after `bun install`.
- **[Trade-off] Some large deep files remain** -> Locality and Interface leverage take precedence over uniform file size.

## Migration Plan

No data or user migration is required. Internal moves land in dependency-ordered commits; package exports and CLI contracts remain stable. Any slice can be reverted independently because it does not alter persisted state. The OpenSpec change remains active until all gates and independent review pass.

## Open Questions

None. The user's request selects the complete behavior-preserving health pass; any discovered product-contract redesign will be reported separately rather than folded into this refactor.
