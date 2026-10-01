# CLI Distribution Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in the active `ship-installable-npm-cli` delta specification until that change is archived into `spec.md`.

## Ownership

`apps/cli` owns the public unscoped `ctxindex` package manifest, executable
entrypoint, and Bun-target bundle. The repository root remains a private
orchestration package. Internal workspaces are build-time dependencies whose
code is bundled; they are not public npm runtime dependencies.

`scripts/release/cli-package.ts` owns staging, the generated publish manifest,
archive policy, logical reproducibility, and exact-tarball smoke. The release
workflow composes those repository commands and does not reconstruct package
policy in workflow shell.

## Package contract and artifact flow

The staged package contains exactly `package.json`, `README.md`, `LICENSE`,
`dist/ctxindex.mjs`, and the private sibling executable
`dist/ctxindex-daemon`. Its manifest exposes only `ctxindex` through the bundled
CLI executable, requires Bun 1.3.14, declares the MIT license, identifies
`https://ctxindex.com` as its homepage and
`https://github.com/barisgit/ctxindex/issues` as its issue tracker, and retains
only `keytar@7.9.0` as an external runtime dependency. `trustedDependencies`
permits Bun to install the native `keytar` module. No runtime dependency or
bundled import may use the workspace protocol or an internal `@ctxindex/*`
package. Only the CLI version is injected from the source manifest. The build
rewrites dependency `__dirname` references to the bundle directory so the
executable has no development manifest or absolute source-checkout path after
relocation.

The flow is CLI and daemon source entrypoints → Bun-target bundles → minimal
staging directory → allowlisted `.tgz` → isolated global installation →
protected publication.
Pack, smoke, artifact transfer, and publish address the same tarball rather than
repacking. Reproducibility compares sorted archive member paths and SHA-256
content digests, avoiding transport metadata as a false source change.

Contributors build and expose the executable with `cd apps/cli && bun run
build:package && bun link`. The checkout-oriented `bun cli` path remains
available for isolated development.

## Isolation and compatibility

Package tests use temporary `BUN_INSTALL_GLOBAL_DIR`, `BUN_INSTALL_BIN`,
`BUN_INSTALL_CACHE_DIR`, and `CTXINDEX_*_HOME` paths. They do not access the
user's package installation, configuration, database, provider state, or
credentials. The exact-tarball smoke runs outside the checkout and proves the
installed bin, packaged detached daemon start/status/stop on supported hosts and
safe fail-closed startup on unsupported hosts, native `keytar` load when the
host supplies its platform library, OAuth App help plus pre-init
no-side-effect rejection, bundled skills, embedded SQLite migrations, and
explicit-path manifest-declared package-root TypeScript Extension loading. A
specifically missing Linux `libsecret-1.so.0` is reported
as an unsupported host prerequisite; every other native-load failure remains
fatal. Existing compiled and relocated runtime tests remain complementary
repository gates.

Archive inspection rejects every non-allowlisted path, unsafe traversal,
credential-like content, workspace metadata/imports, source maps, source,
tests, specs, VCS files, and configuration files.

## Release security

The GitHub-hosted workflow pins Bun 1.3.14 and every third-party action by commit,
disables persisted checkout credentials, serializes releases, and grants only
`contents: read` by default. Only the protected `npm-production` publish job has
`id-token: write`; no npm token is configured.

On a push to `main`, the gate compares the CLI version at `github.event.before`
with the current manifest, validates a strict forward semantic-version change,
and queries exact npm version presence. Existing exact versions are idempotent
successful no-ops. Unchanged unpublished, malformed, reversed, mismatched, or
indeterminate results fail closed. After environment approval, the publish job
verifies the transferred artifact checksum and repeats the exact absence check
immediately before tokenless trusted publication.

The first package publication remains a Human checkpoint: inspect and manually
publish the exact verified MIT-licensed tarball using package-owner 2FA, then
configure npm's trusted publisher for `barisgit/ctxindex`, `release.yml`, and
`npm-production` with Allowed actions: `npm publish`, protect the matching
GitHub environment, and approve later OIDC releases. Automation never
bootstraps package ownership.
