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
3. `runCli` dispatches through the command tree with a build-injected `__CTXINDEX_VERSION__`, falling back to `0.0.0` outside the bundle. Database-backed handlers require both config and database evidence from explicit `init` before opening SQLite. `oauth-app add --from-env` validates the Provider, checks initialization before reading Provider-declared config environments, and imports the config into a secret-backed local App. `account add --app` performs consent with that exact App and snapshots its config into the stable private Grant, and labeled Sources bind the Grant by Adapter id. Action descriptions preserve registry-derived strict unions as numbered alternatives. `extensions catalog` delegates Git acquisition and persisted provenance to core while startup remains offline. `init` selects a backend only for a fresh config.
4. The returned numeric status is assigned to `process.exitCode` by the shim.

## Integration points

- Invoked from the repository's `package.json` script `cli` or the package-local `apps/cli/package.json` script `cli`; both route through `scripts/cli.sh` so helper-created worktrees isolate state.
- Private workspace and JavaScript dependencies remain build-time development inputs bundled into `dist/ctxindex.mjs`; the staged npm manifest retains only native `keytar@7.9.0` as an external runtime dependency.
- Detailed maps: `apps/cli/bin/codemap.md` and `apps/cli/src/codemap.md`.
