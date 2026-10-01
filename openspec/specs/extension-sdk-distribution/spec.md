# extension-sdk-distribution Specification

## Purpose
TBD - created by archiving change publish-extension-sdk. Update Purpose after archive.
## Requirements
### Requirement: Public Extension SDK is a real installable package
The repository SHALL produce `@ctxindex/extension-sdk@0.1.0` as a public npm package containing executable ESM and TypeScript declarations for the complete supported authoring surface. The package MUST export the same factories, definition types, operation-context types, documentation helper, authentication helper, and `z` convenience value as the workspace entry. It MUST NOT be an empty reservation package.

#### Scenario: Clean external authoring package imports SDK
- **WHEN** a clean package installs the packed SDK and imports representative Provider, Profile, Adapter, OAuth App, Extension, Catalog, documentation, operation-context, and `z` exports
- **THEN** its TypeScript check and Bun runtime import succeed without monorepo resolution or host injection

### Requirement: SDK artifact is minimal and relocatable
The SDK archive MUST contain only its public manifest, README, MIT license, executable ESM, and declaration files. It MUST NOT contain source tests, workspace dependency specifiers, private ctxindex runtime imports, absolute checkout paths, credentials, lifecycle scripts, or undeclared runtime dependencies. Its runtime dependency ranges MUST be bounded and reproducible from the package manifest.

#### Scenario: Packed artifact is inspected outside repository
- **WHEN** the SDK tarball is unpacked in an isolated temporary directory
- **THEN** every archived path and manifest field is allowlisted and all runtime and declaration imports resolve from the package plus declared dependencies

### Requirement: Exact SDK artifact is verified before first publication
Build, pack, content verification, clean install, typecheck, runtime import, and checksum generation MUST operate on one exact tarball. The first npm publication SHALL remain a Human checkpoint and MUST publish that verified tarball rather than rebuilding it.

#### Scenario: First scoped publication is prepared
- **WHEN** `@ctxindex/extension-sdk@0.1.0` is absent from npm
- **THEN** automation produces and verifies one checksummed tarball but does not require a token or publish from a general test lane
