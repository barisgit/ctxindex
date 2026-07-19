# scripts/release/

## Responsibility

Builds, validates, smoke-tests, and release-gates the public `ctxindex` npm
artifact without publishing from local development or touching user state.

## Design / patterns

- `cli-package.ts` is the package-policy owner. It builds the Bun-target bundle,
  creates a minimal staging manifest, packs an allowlisted archive, computes
  normalized content digests, and rejects unsafe paths, unexpected files,
  workspace imports/specifiers, or credential-like content.
- Its exact-tarball smoke creates temporary state outside the checkout, installs
  globally under isolated Bun directories, and proves the installed bin, native
  `keytar`, bundled skills, embedded SQLite migrations, and explicit TypeScript
  Extension loading.
- `release-gate.ts` separates a pure strict-semver/registry decision from Git and
  npm-registry I/O. Exact existing versions skip idempotently; only a forward,
  unpublished version proceeds, and every indeterminate response fails closed.

## Data & control flow

1. The CLI workspace entrypoint is bundled while only `keytar` remains external.
2. The bundle, package README, canonical root license, and generated manifest are
   copied into ignored staging state and packed once.
3. Archive inventory and content are verified before an isolated global install.
4. `.github/workflows/release.yml` transfers that exact archive plus checksum to
   the protected publish job, which repeats registry absence before publication.

## Integration points

- Consumes `apps/cli/package.json`, `apps/cli/bin/ctxindex.mjs`,
  `apps/cli/README.md`, and the root `LICENSE`.
- Exposed through root `build:cli-package`, `pack:cli-package`, and
  `smoke:cli-package` scripts and composed by the release workflow.
- Tests live beside the scripts; installed CLI state is confined to temporary
  `BUN_INSTALL_*` and `CTXINDEX_*_HOME` directories.
