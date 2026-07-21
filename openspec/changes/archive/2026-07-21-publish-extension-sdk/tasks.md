## 1. Public package contract

- [x] 1.1 Add failing focused tests for the public manifest, root export coverage, archive allowlist, bounded dependencies, and unsafe-content rejection
- [x] 1.2 Configure `@ctxindex/extension-sdk@0.1.0` to build executable ESM and declarations from its public entry without private workspace imports
- [x] 1.3 Add the package README and deterministic staging, packing, inspection, and checksum commands; pass focused package-contract tests

## 2. External consumer proof

- [x] 2.1 Add a clean external authoring fixture that imports representative SDK factories, types, operation context, documentation, authentication helpers, and SDK-exported `z`
- [x] 2.2 Install the exact packed tarball in isolation and pass external TypeScript and Bun runtime checks with no workspace links or host injection
- [x] 2.3 Update the relocated compiled Extension gate to consume the packed public SDK artifact and pass its focused E2E test

## 3. Doctrine and final verification

- [x] 3.1 Promote applicable doctrine into canonical `extension-sdk-distribution` and `extension-loading` implementation sidecars and refresh affected codemaps
- [x] 3.2 Run package build, focused tests, `bun run ci`, strict OpenSpec validation, OpenSpec change verification, and `git diff --check`
- [x] 3.3 Produce and inspect the final checksummed `@ctxindex/extension-sdk@0.1.0` tarball for the Human publication checkpoint without publishing it
