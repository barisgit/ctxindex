# apps/cli/

## Responsibility

Packages the Bun-executed `ctxindex` command-line application, from its executable shim to the TypeScript application layer.

## Design / patterns

- `bin/ctxindex.mjs` is a minimal executable adapter; all registration, orchestration, and formatting live under `src/`.
- `package.json` declares the public unscoped ESM `ctxindex` package, maps the `ctxindex` bin to `dist/ctxindex.mjs`, pins Bun 1.3.14, and delegates `build:package` to `scripts/release/build-cli-package.ts`. That builder injects the package version, keeps `keytar` external, rewrites selected Pino/thread-stream path lookups for relocation, rejects source-checkout paths in the bundle, and writes the executable output. `package.json` also owns lint, format, typecheck, test, clean/fullclean, and marker-aware `cli` tasks.
- The package follows a layered CLI architecture: executable shim -> citty composition root -> parser/handler/workflow modules -> core services -> output adapters; secret-backend policy remains in core rather than command handlers.

## Data & control flow

1. Bun starts `apps/cli/bin/ctxindex.mjs` with process argv.
2. The shim calls `apps/cli/src/main.ts#runCli(process.argv.slice(2))`.
3. `runCli` dispatches through the command tree; handlers parse arguments, load dependencies and definitions, invoke core behavior, and format output. The root-command version is the build-injected `__CTXINDEX_VERSION__`, falling back to `0.0.0` outside the bundle. Action descriptions preserve registry-derived strict unions by rendering each `oneOf`/`anyOf` alternative as a numbered text or Markdown branch, so standalone and threaded-reply Draft inputs remain inspectable. `extensions catalog` delegates Git acquisition and persisted provenance to core: list/show/install refresh by default, `--no-refresh` reads stored snapshots, and startup remains offline. `client` imports declared environment credentials once, `account` performs consent with a persisted client, and labeled Sources bind the resulting stable Grant. `init` asks core to select a backend only for a fresh config, while `secrets status` and `secrets backend set` use focused secret dependencies.
4. The returned numeric status is assigned to `process.exitCode` by the shim.

## Integration points

- Invoked from the repository's `package.json` script `cli` or the package-local `apps/cli/package.json` script `cli`; both route through `scripts/cli.sh` so helper-created worktrees isolate state.
- Private workspace and JavaScript dependencies remain build-time development inputs bundled into `dist/ctxindex.mjs`; the staged npm manifest retains only native `keytar@7.9.0` as an external runtime dependency.
- Detailed maps: `apps/cli/bin/codemap.md` and `apps/cli/src/codemap.md`.
