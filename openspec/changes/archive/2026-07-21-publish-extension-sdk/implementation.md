## Capability Implementation Targets

- `extension-sdk-distribution` → `openspec/specs/extension-sdk-distribution/implementation.md`
- `extension-loading` → `openspec/specs/extension-loading/implementation.md`

## Module Ownership

`packages/extension-sdk/src/index.ts` remains the single public authoring entry. Its source modules own definition factories, public definition types, operation context, documentation descriptors, authentication helpers, and the convenience `z` export. The package has no dependency on Core, Profiles, official integrations, RPC, daemon, or CLI.

Package-local build and verification tooling owns transformation of that entry into a public npm artifact. It may depend on repository tooling during development, but the staged artifact contains only its public runtime, declarations, metadata, README, and license. Release orchestration may call these commands but does not own or reproduce their packaging rules.

## Interfaces and Data Flow

The public root export map is the compatibility boundary. Runtime output is one ESM entry that externalizes `zod`; declaration output preserves the same named exports and inference from the authored source tree, with explicit `.js` relative specifiers for ESM-aware NodeNext and Bundler resolution. The package manifest points both `types` and `import` conditions at those built files and declares every external runtime dependency.

Build writes deterministic package output, staging copies an explicit allowlist, pack creates one tarball, and verification consumes that exact path for archive inspection, clean installation, TypeScript compilation, runtime import, and checksum generation. Verification failures stop before publication and identify the violated package boundary.

The compiled Extension gate installs the same packed tarball into an isolated external package. Extension loading then sees ordinary JavaScript values and structural discriminators; it never depends on physical SDK identity, workspace links, host injection, or source-checkout resolution.

## Storage and State

Build directories, staging directories, isolated install roots, tarballs, and checksums are disposable artifacts. No runtime ctxindex state or user data is read or changed. The tarball path is the immutable handoff between build verification and the Human publication checkpoint.

## Security and Compatibility

Packaging is deny-by-default through an exact path allowlist plus scans for credentials, workspace protocols, absolute checkout paths, undeclared imports, and lifecycle scripts. The artifact performs no network access except dependency installation during the explicit isolated verification gate; publishing is outside general CI and requires human authorization.

The initial supported runtime is ESM on pinned Bun. Zod remains external with a bounded compatible range, while authors should normally consume the SDK-exported `z`. Public definition recognition remains structural so separately installed SDK and Zod copies are supported. No CommonJS, browser, or Node compatibility is implied by this release.

## Verification

Focused package tests validate manifest construction, the exact archive allowlist, secret and workspace-path rejection, declaration/runtime import closure, and checksum stability. A clean external NodeNext fixture imports representative values from every public authoring category, typechecks them, and executes them against a separately installed SDK copy. The relocated compiled-binary Extension gate must install the packed artifact rather than linking the workspace.

Cross-cutting gates remain package build, package tests, repository CI, strict OpenSpec validation, and `git diff --check`.

## Promotion Notes

- Create `openspec/specs/extension-sdk-distribution/implementation.md` with the SDK ownership boundary, ESM-plus-declarations package interface, exact-tarball data flow, allowlisted artifact security rules, and isolated install verification doctrine above.
- Update `openspec/specs/extension-loading/implementation.md` so the relocated compiled gate installs the exact packed public SDK artifact and proves loading without workspace links, host injection, source-checkout resolution, or physical SDK identity.
