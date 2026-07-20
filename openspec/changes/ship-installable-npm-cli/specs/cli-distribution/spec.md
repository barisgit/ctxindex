## ADDED Requirements

### Requirement: Installable public CLI package

The repository SHALL keep its monorepo root private and SHALL produce an unscoped public npm package named `ctxindex` from the CLI workspace. The package MUST expose a `ctxindex` executable that runs with Bun 1.3.14 after a global installation, MUST identify `https://ctxindex.com` as its homepage and `https://github.com/barisgit/ctxindex/issues` as its issue tracker, and MUST NOT require any unpublished `workspace:*` runtime dependency. Contributors MUST be able to build the package and link that executable locally through Bun.

#### Scenario: Contributor links the built CLI

- **WHEN** a contributor installs repository dependencies, builds the CLI workspace, and runs the documented Bun link command
- **THEN** `ctxindex --help` executes the built package entrypoint

#### Scenario: Installed package has a closed runtime graph

- **WHEN** the packed package metadata and executable are inspected
- **THEN** the package is public and unscoped, exposes the `ctxindex` bin and canonical project and issue-tracker links, and contains no unpublished workspace dependency or workspace import

### Requirement: Deterministic and safe publish artifact

The repository SHALL build and pack the CLI through deterministic commands. The publish artifact MUST contain only an explicit allowlist of package files, MUST reject secret-bearing or repository-only paths and sensitive content, and MUST preserve identical logical file names and file content across repeated builds from the same source. The exact archive that passes verification MUST be the archive supplied to installation smoke testing and publication.

#### Scenario: Package contents are audited before use

- **WHEN** release verification inspects a packed CLI archive
- **THEN** every archive member is allowlisted, sensitive names and content are absent, runtime metadata is valid, and bundled output contains no workspace specifier

#### Scenario: Repeated builds are logically reproducible

- **WHEN** the package is built and packed twice from unchanged source
- **THEN** the normalized archive member list and content digests are identical

### Requirement: Relocated installed behavior

Automated verification MUST install the exact packed archive globally into a temporary isolated Bun home and MUST execute `ctxindex` from outside the repository with isolated configuration, data, state, and cache roots. The installed CLI MUST preserve generated help, OAuth App help before initialization, pre-initialization no-side-effect rejection with guidance to run `ctxindex init`, embedded bundled skills, fresh SQLite migration and native Bun runtime behavior, and explicit-path manifest-declared package-root TypeScript Extension loading. Existing relocated compiled CLI and Extension verification MUST remain green.

#### Scenario: Exact tarball executes outside checkout

- **WHEN** the verified archive is globally installed in an isolated temporary Bun home and invoked from an unrelated working directory
- **THEN** help, package-appropriate `ctxindex init` guidance, bundled skills, fresh initialization/storage, and external Extension loading succeed without resolving repository files

### Requirement: Guarded trusted npm release

The repository SHALL define a GitHub-hosted release workflow triggered by pushes to `main`, using Bun 1.3.14 and least-privilege permissions. Gate and validation jobs MUST have read-only repository permission; only the protected publish job MAY receive `id-token: write`. The workflow MUST provide named CI, build, pack, smoke, and publish steps, serialize releases, and publish through npm trusted publishing without a long-lived npm token. It MUST publish only when `apps/cli/package.json` is valid semantic versioning, is strictly increased from `github.event.before`, and is absent from npm. An exact version already published MUST skip successfully; an unchanged unpublished version, invalid/reversed version, or indeterminate registry response MUST fail closed. The artifact MUST carry the repository's canonical MIT license. The first live publication MUST pause for exact-artifact review and manual owner-2FA bootstrap publication, followed by trusted-publisher and GitHub environment configuration.

#### Scenario: Invalid release is stopped before publishing

- **WHEN** the CLI version was not newly bumped, the exact version already exists, CI fails, packaging is unsafe, or the exact tarball smoke fails
- **THEN** the workflow exits before requesting an npm publish identity or mutating the registry

#### Scenario: Replayed main push is idempotent

- **WHEN** a `main` workflow finds the exact `ctxindex@<version>` on npm, including after a successful prior run
- **THEN** it completes successfully without building a second publish artifact or invoking npm publish

#### Scenario: Unbumped unpublished version fails closed

- **WHEN** a `main` workflow observes an unchanged CLI version and that exact version is absent from npm
- **THEN** it fails with version-bump guidance and does not build or publish an artifact

#### Scenario: Trusted publish has narrowly scoped identity permission

- **WHEN** all release preflights pass and a protected release is approved
- **THEN** only the publish job can mint an OIDC identity and it invokes npm publishing without an npm token

#### Scenario: First release requires maintainer action

- **WHEN** `ctxindex` has not yet completed its first npm publication and trusted-publisher setup
- **THEN** automation documents and waits for exact-artifact review, manual owner-2FA bootstrap publication, trusted-publisher configuration, and protected-environment confirmation before any live publish
