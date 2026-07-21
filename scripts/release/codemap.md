# scripts/release/

## Responsibility

Builds, validates, smoke-tests, and release-gates the public `ctxindex` npm
artifact without publishing from local development or touching user state.

## Design / patterns

- `build-cli-package.ts` is the bundle-policy owner. It emits the Bun-target CLI
  bundle with only `keytar` external, injects the package version, rewrites
  thread-stream/Pino path assumptions for a relocatable `import.meta.dir`
  bundle, and rejects output containing the source-checkout path.
- `cli-package.ts` is the package-policy owner. It creates a minimal staging manifest, packs an allowlisted archive, computes
  normalized content digests, and rejects unsafe paths, unexpected files,
  workspace imports/specifiers, development manifests, absolute checkout paths,
  credential-like content, or non-canonical project and issue-tracker links.
- Its exact-tarball smoke creates temporary state outside the checkout, installs
  globally under isolated Bun directories, and proves the installed bin, native
  `keytar` when the host supplies its platform library, OAuth App help and pre-init
  isolation with package-appropriate `ctxindex init` guidance, bundled skills,
  embedded SQLite migrations, detached packaged daemon start/status/stop, and manifest-declared
  package-root TypeScript Extension loading. A Linux probe failure that reports
  unavailable `libsecret-1.so.0` is classified as `host-libsecret-unavailable`;
  every other native-load failure remains fatal.
- `release-gate.ts` separates a pure strict-semver/registry decision from Git and
  npm-registry I/O. Exact existing versions skip idempotently; only a forward,
  unpublished version proceeds, and every indeterminate response fails closed.

## Data & control flow

1. `apps/cli`'s `build:package` calls `build-cli-package.ts` to bundle the CLI while only `keytar` remains external.
2. The bundle, package README, canonical root license, and generated manifest are
   copied into ignored staging state and packed once.
3. Archive inventory and content are verified before an isolated global install.
4. `.github/workflows/release.yml` transfers that exact archive plus checksum to
   the protected publish job, which repeats registry absence before publication.
5. Only after npm publication succeeds, an isolated `contents: write` job
   verifies the transferred archive again, creates or confirms the exact
   commit-bound version tag, and creates or refreshes its GitHub Release assets.

## Integration points

- Consumes `apps/cli/package.json`, `apps/cli/bin/ctxindex.mjs`,
  `apps/cli/README.md`, and the root `LICENSE`.
- Exposed through root `build:cli-package`, `pack:cli-package`, and
  `smoke:cli-package` scripts and composed by the release workflow.
- Tests live beside the scripts; installed CLI state is confined to temporary
  `BUN_INSTALL_*` and `CTXINDEX_*_HOME` directories.
