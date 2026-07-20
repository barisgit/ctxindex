## Why

Issue #56 identifies that ctxindex has no supported package-manager installation path: the CLI workspace is private, depends on unpublished workspace packages, and can only be run from a checkout or as a repository-built executable. A deterministic public npm artifact and guarded trusted-publishing workflow are needed so users can install `ctxindex` globally while contributors can exercise the exact package locally before the first release.

## What Changes

- Keep the root monorepo private while making `apps/cli` the public, unscoped `ctxindex` package with a `ctxindex` executable.
- Add deterministic package build and pack verification that bundles runtime workspace code, allowlists published files, and rejects workspace dependencies, secrets, and repository-only material.
- Support contributor build and `bun link` workflows without changing the existing repository CLI path.
- Prove the exact packed tarball installs into an isolated temporary Bun home and runs outside the checkout, while preserving relocated compiled Extension, native runtime, migration SQL, and bundled-skill behavior.
- Add a least-privilege GitHub release workflow on pushes to `main` with pinned Bun, version-change and existing-version preflights, CI/build/pack/smoke stages, concurrency control, trusted npm publishing without an npm token, and an explicit first-publish Human checkpoint.

## Capabilities

### New Capabilities

- `cli-distribution`: Owns the installable npm package, deterministic artifact and isolated-install verification, contributor linking, and trusted release workflow.

### Modified Capabilities

- None.

## Impact

- Package metadata and lockfile for the root workspace and `apps/cli`.
- CLI build output, executable shim, packaging/release verification, and GitHub Actions release automation.
- Contributor and installation documentation.
- npm becomes a distribution boundary, but no provider state, schema, CLI command behavior, or credential handling changes.
