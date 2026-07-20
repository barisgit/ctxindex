## Context

The root package and every workspace are private. `apps/cli` executes TypeScript directly from the checkout and declares `workspace:*` runtime dependencies, while release-oriented tests compile a standalone Bun executable. Users therefore cannot install the CLI through npm, and contributors cannot validate the package-manager path that users will receive.

The distribution must preserve Bun 1.3.14 behavior, embedded migration SQL and skills, manifest-declared package-root TypeScript Extension loading, and native Keychain support. Release automation must use npm trusted publishing on a GitHub-hosted runner without a long-lived npm token. The first publication cannot be automated safely until maintainers have reviewed the packed artifact and configured npm/GitHub trust.

## Goals / Non-Goals

**Goals:**

- Produce one public unscoped `ctxindex` package whose executable runs under Bun outside the checkout.
- Keep internal workspace packages unpublished and absent from the packed runtime dependency graph.
- Make build, pack, isolated global-install smoke testing, and contributor linking reproducible repository commands.
- Restrict publication to a newly bumped, unpublished CLI version on `main` through a protected trusted-publishing job.

**Non-Goals:**

- Publishing `@ctxindex/core`, `@ctxindex/adapters`, `@ctxindex/profiles`, or `@ctxindex/extension-sdk`.
- Replacing the compiled-executable verification path or changing CLI/domain behavior.
- Publishing from this change, handling npm credentials, or changing user/provider state.
- Adding a Node runtime target or platform-specific npm packages.

## Decisions

1. **Publish a Bun-target JavaScript bundle.** `apps/cli` builds its executable entrypoint into one relocatable ESM file. This keeps one cross-platform package and avoids publishing internal workspace packages. Publishing the workspace graph was rejected because it would expose private implementation packages and require coordinated versioning.
2. **Externalize only the native Keychain module.** A build probe shows Bun cannot bundle `keytar` because its JavaScript loader resolves a platform-specific `.node` artifact. `keytar` remains the package's exact public runtime dependency; every workspace package and other JavaScript dependency is bundled. This is narrower than publishing internal packages and retains the existing Keychain behavior.
3. **Use a strict package allowlist and an exact tarball smoke.** The npm package includes package metadata, package-local installation guidance, the canonical MIT license, and the built executable only. Verification inspects the tar archive, rejects unexpected paths and sensitive filename/content patterns, confirms no `workspace:` dependency survives, installs that exact archive into a temporary isolated Bun home, and runs from outside the repository with isolated ctxindex state.
4. **Keep compiled and npm relocation proofs complementary.** Existing compiled Extension, catalog, skills, SQLite, and provider-workflow tests remain mandatory. The npm smoke adds the installed package path, embedded skills, migration/bootstrap, and external Extension loading without duplicating the full provider suite.
5. **Publish from protected pushes to `main`.** A GitHub-hosted publish job receives `id-token: write`; gate and validation jobs retain `contents: read` only. The workflow pins Bun 1.3.14, compares the pushed `apps/cli/package.json` version with `github.event.before`, requires a valid strictly increased semantic version, and queries the exact npm version. An exact version already on npm is an idempotent successful skip. A changed, unpublished version reruns CI, builds and packs once, smoke-tests that exact archive, transfers it unchanged to the protected job, then invokes npm trusted publishing without `NODE_AUTH_TOKEN`. An unchanged unpublished version is an error requiring an explicit version bump; concurrency serializes `main` releases.
6. **Make the first publication a Human checkpoint.** npm trusted publishing cannot bootstrap a package that does not yet exist. The project uses the user-approved MIT license with the canonical root notice. Before the automated path is enabled, a maintainer must inspect the exact verified artifact, manually publish that artifact as the package owner with 2FA, configure the `release.yml` trusted publisher and protected `npm-production` GitHub environment, then explicitly approve later OIDC publication. Automation is prepared but no publish occurs during implementation.

## Risks / Trade-offs

- **Native `keytar` installation can depend on platform toolchain/prebuild availability** → Keep it as the sole external runtime dependency, trust its install lifecycle explicitly, and exercise native availability in the package smoke where the host supports it.
- **Bundling can hide accidentally omitted runtime assets** → Keep migration SQL and skills embedded and test them from the exact installed tarball outside the checkout.
- **Archive metadata can vary across pack invocations** → Treat deterministic distribution as deterministic file set and contents, record the single packed archive as the artifact passed unchanged to smoke and publish, and compare repeated package manifests/content hashes in verification.
- **OIDC configuration mismatch blocks release** → Document exact npm publisher fields and GitHub environment name; preflight all non-authenticated conditions before the protected publish job.
- **A retried or unrelated push to `main` could republish** → Require a strict version increase for an unpublished version, treat an existing exact npm version as an idempotent successful skip, fail unchanged unpublished versions, and recheck registry absence immediately before publish.
- **The unscoped package name may already exist and OIDC cannot bootstrap it** → Stop at the Human checkpoint, verify registry ownership immediately before the first live action, and manually publish the exact inspected artifact with owner 2FA before configuring trusted publishing.

## Migration Plan

No persisted ctxindex state or database migration is involved. Contributors update dependencies once, build `apps/cli`, and may replace checkout-only invocation with the documented `bun link` path. Releases begin only after the CLI version is deliberately bumped on `main` and the first-publish checkpoint is completed.

## Open Questions

None for implementation. npm name ownership and trusted-publisher activation remain live-state checks at the Human checkpoint.
