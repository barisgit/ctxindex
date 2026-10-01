# Extension SDK Distribution Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md).

## Ownership and dependency direction

`packages/extension-sdk/src/index.ts` is the single public authoring entry. It owns definition factories, public definition types, operation contexts, documentation descriptors, authentication helpers, and the convenience `z` export. It has no dependency on Core, Profiles, official integrations, RPC, daemon, or CLI.

Package-local build and verification tooling transforms that entry into the public npm artifact. Release orchestration may call those commands but must not reproduce or weaken their package rules.

## Public package interface

The root export map is the compatibility boundary. The artifact provides one executable ESM entry with Zod externalized and a declaration tree preserving the same named exports and inference. Relative declaration imports use explicit `.js` specifiers and resolve to archived declaration targets under both NodeNext and Bundler TypeScript resolution. Its manifest resolves both `types` and `import` conditions to built files and declares every external runtime dependency.

Build writes package output, staging copies an explicit allowlist, pack creates one tarball, and verification consumes that exact path for archive inspection, clean installation, TypeScript compilation, runtime import, and checksum generation. The tarball is the immutable handoff to publication.

## Security and compatibility

Packaging is deny-by-default through an exact path allowlist plus scans for credentials, workspace protocols, absolute checkout paths, undeclared imports, private ctxindex runtime imports, and lifecycle scripts. Publishing is not a general CI effect and remains a Human checkpoint.

The initial runtime contract is ESM on Bun 1.3.14. Zod remains external with a bounded compatible range, while authors should normally consume SDK-exported `z`. Public definitions remain structurally recognizable across separate physical SDK and Zod copies. No CommonJS, browser, or Node guarantee is implied.

## Verification

Focused tests enforce manifest construction, root export coverage, the exact archive allowlist, declaration closure, and unsafe-content rejection. A clean external NodeNext package imports every public authoring category, typechecks, and runs from the packed artifact. Package build, repository CI, strict OpenSpec validation, and checksum inspection remain cross-cutting gates.
