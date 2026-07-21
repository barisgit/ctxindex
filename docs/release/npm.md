# npm releases

The initial npm publications and trusted-publisher setup are complete. Three packages are released from this repository:

| Package | Version source | Workflow |
|---|---|---|
| [`ctxindex`](https://www.npmjs.com/package/ctxindex) | `apps/cli/package.json` | `.github/workflows/release.yml` |
| [`@ctxindex/extension-sdk`](https://www.npmjs.com/package/@ctxindex/extension-sdk) | `packages/extension-sdk/package.json` | `.github/workflows/publish-packages.yml` |
| [`@ctxindex/profiles`](https://www.npmjs.com/package/@ctxindex/profiles) | `packages/profiles/package.json` | `.github/workflows/publish-packages.yml` |

Do not publish these packages manually during normal releases. Bump the intended package version, merge to `main`, and let the matching workflow build and publish the exact artifact.

## CLI release

`release.yml` runs on pushes to `main`:

1. Validate the current semantic version against the previous commit and query the exact npm version.
2. Run `bun run ci`, build the CLI, create the allowlisted tarball, verify its SHA-256 checksum, and smoke-install that exact archive.
3. In the protected `npm-production` environment, download and re-verify the artifact, repeat the registry preflight, and publish with npm trusted publishing.
4. Tag the published commit as `v<version>` and attach the same tarball and checksum to its GitHub Release.

The public archive contains the generated manifest, `README.md`, `LICENSE`, `dist/ctxindex.mjs`, and its adjacent `dist/ctxindex-daemon`. `keytar@7.9.0` remains an external runtime dependency so Bun installs the native module for the destination host.

## Library releases

`publish-packages.yml` detects version changes for `@ctxindex/extension-sdk` and `@ctxindex/profiles`. It builds, packs, verifies, and smoke-tests only changed packages, then publishes them in dependency order: Extension SDK before Profiles.

The publish job re-verifies downloaded checksums and registry state. On a workflow retry, an existing exact version is accepted only when npm's published archive integrity matches the prepared artifact; mismatches fail closed.

## Trusted publishing

Both workflows use npm's GitHub Actions OIDC trusted publishing. Only their publish jobs receive `id-token: write`, and both use the protected `npm-production` GitHub environment. No npm token belongs in repository secrets or workflow configuration.

Each npm trusted-publisher record must keep **Allowed actions: `npm publish`**.

The npm trusted-publisher records are:

| Packages | Repository | Workflow filename | Environment |
|---|---|---|---|
| `ctxindex` | `barisgit/ctxindex` | `release.yml` | `npm-production` |
| `@ctxindex/extension-sdk`, `@ctxindex/profiles` | `barisgit/ctxindex` | `publish-packages.yml` | `npm-production` |

If a publisher record, workflow filename, or environment changes, update npm and GitHub together before merging a version bump. Keep the environment protected and preserve exact-artifact verification, registry fail-closed behavior, and dependency ordering.
