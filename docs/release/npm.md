# npm release

The repository root remains private. `apps/cli` supplies the public, unscoped
`ctxindex` package, while `scripts/release/cli-package.ts` constructs a minimal
staging package containing only `package.json`, `README.md`, `LICENSE`, and the
Bun-target `dist/ctxindex.mjs` executable. The generated manifest has no
`workspace:*` runtime dependency; only `keytar@7.9.0` remains external so Bun can
install its native module.

## Automated release contract

`.github/workflows/release.yml` runs on pushes to `main` and serializes release
candidates. Before CI, it compares the current CLI version with the version at
`github.event.before` and queries the exact `ctxindex@<version>` registry entry.
A valid, strictly increased, unpublished semantic version proceeds. An already
published exact version is a successful no-op. An unchanged unpublished version,
an invalid or reversed version, or any registry result other than an exact match
or 404 fails closed.

CI, build, pack, and the isolated global-install smoke run without OIDC
permission. The workflow uploads the exact verified tarball and its checksum.
Only the `Publish` job uses the protected `npm-production` environment and
receives `id-token: write`; after approval it downloads and verifies that
artifact, repeats the exact registry-absence check, and uses npm trusted
publishing without `NODE_AUTH_TOKEN` or another long-lived npm credential.

## First publication: Human checkpoint

npm trusted publishing cannot create a package that does not yet exist. Do not
enable the automated publish path until a package owner has completed all of
these steps:

1. Inspect the final tarball and its extracted manifest/files. Confirm the MIT
   `LICENSE` notice and the exact artifact checksum produced by CI.
2. Confirm the unscoped `ctxindex` name and exact version are available on npm.
3. Manually publish that exact inspected tarball with the owner's required 2FA.
4. In npm package settings, add a GitHub Actions trusted publisher for repository
   `barisgit/ctxindex`, workflow filename `release.yml`, and environment
   `npm-production`.
5. In GitHub, create and protect the `npm-production` environment with required
   reviewers before approving later OIDC publication.

No npm token belongs in repository secrets or workflow configuration. Live name
ownership, the bootstrap publication, trusted-publisher configuration, and
environment approval remain maintainer actions.
