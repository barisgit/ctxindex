# npm release

The repository root remains private. `apps/cli` supplies the public, unscoped
`ctxindex` package, while `scripts/release/cli-package.ts` constructs a minimal
staging package containing only `package.json`, `README.md`, `LICENSE`, and the
bundled CLI entrypoint `dist/ctxindex.mjs` plus its private sibling
`dist/ctxindex-daemon` executable. The generated manifest exposes only the
`ctxindex` command and has no
`workspace:*` runtime dependency; only `keytar@7.9.0` remains external so Bun can
install its native module.

## Automated release contract

`.github/workflows/release.yml` runs on pushes to `main` and serializes release
candidates. Before CI, it compares the current CLI version with the version at
`github.event.before` and queries the exact `ctxindex@<version>` registry entry.
A valid unpublished semantic version that is no lower than the previous version
proceeds, including a retry after failed publication. An already published exact
version is a successful no-op. An invalid or reversed version, or any registry
result other than an exact match or 404 fails closed.

After the version gate, one cached job runs the fast repository gate, builds and
packs the CLI, and performs the isolated global-install smoke without OIDC
permission. Deeper integration and CLI/daemon E2E lanes remain required on pull
requests rather than delaying the release pipeline. The workflow uploads the
exact verified tarball and its checksum.
Only the `Publish` job uses the protected `npm-production` environment and
receives `id-token: write`; after approval it downloads and verifies that
artifact, repeats the exact registry-absence check, and uses npm trusted
publishing without `NODE_AUTH_TOKEN` or another long-lived npm credential.
After publication succeeds, a separate job with only `contents: write`
downloads and verifies the same artifact, creates the lightweight
`v<version>` tag only at the published `main` commit, and creates a GitHub
Release carrying that tarball and checksum. A rerun accepts only an exact
existing tag and refreshes only those two release assets.

The apparent `dist/ctxindex-daemon` executable is a Bun-target JavaScript
bundle with a Bun shebang, not an OS-specific native binary. The external
`keytar` dependency is installed for the destination host. The release smoke
therefore proves the globally installed CLI and direct mode on every runner;
daemon startup is additionally exercised on macOS and deliberately fails
closed as unsupported on Linux.

## First publication: Human checkpoint

npm trusted publishing cannot create a package that does not yet exist. Do not
approve the first workflow's protected `Publish` job. A package owner must
bootstrap the package with these exact steps:

1. In GitHub, create and protect the `npm-production` environment with required
   reviewers so the first `Publish` job cannot run before this checkpoint.
2. Merge the release commit with the intended version bump and let its `CI` and
   `Build, pack, and smoke` jobs finish while `Publish` waits for approval in
   the protected `npm-production` environment.
3. Download the `ctxindex-<version>` workflow artifact. Verify its `.sha256`
   file, inspect the tarball inventory and extracted manifest, and confirm the
   MIT `LICENSE` notice. From the download directory:

   ```sh
   release_version=0.1.0
   archive="ctxindex-${release_version}.tgz"
   test "$(cut -d' ' -f1 "$archive.sha256")" = "$(shasum -a 256 "$archive" | cut -d' ' -f1)"
   tar -tzf "$archive"
   tar -xOzf "$archive" package/package.json
   tar -xOzf "$archive" package/LICENSE
   ```

4. Confirm the unscoped `ctxindex` name and exact version are still absent from
   npm, then manually publish that exact downloaded tarball with the owner's
   required 2FA:

   ```sh
   release_version=0.1.0
   archive="ctxindex-${release_version}.tgz"
   npm view "ctxindex@$release_version" version
   npm publish "$archive" --access public
   ```

   The expected pre-publish `npm view` result is `E404`; any other result stops
   the bootstrap.
5. Cancel the waiting workflow run. Its registry-absence preflight must not be
   weakened or approved after the manual publication.
6. Create lightweight tag `v<version>` at that exact release commit and create
   the GitHub Release with the exact tarball and checksum. This is the one
   bootstrap release that cannot reach the automated post-publish job:

   ```sh
   release_version=0.1.0
   archive="ctxindex-${release_version}.tgz"
   release_commit="FULL_MAIN_COMMIT_SHA"
   git tag "v$release_version" "$release_commit"
   git push origin "refs/tags/v$release_version"
   gh release create "v$release_version" "$archive" "$archive.sha256" \
     --verify-tag --title "ctxindex v$release_version" --generate-notes
   ```
7. In npm package settings, add a GitHub Actions trusted publisher for repository
   `barisgit/ctxindex`, workflow filename `release.yml`, and environment
   `npm-production`. Set Allowed actions: `npm publish`.
8. Keep that environment protected, then use its approval checkpoint for later
   OIDC publications.

No npm token belongs in repository secrets or workflow configuration. Live name
ownership, the bootstrap publication, trusted-publisher configuration, and
environment approval remain maintainer actions.
