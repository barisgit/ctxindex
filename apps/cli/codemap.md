# apps/cli/

## Responsibility

Packages the Bun-executed `ctxindex` command-line application, from its executable shim to the TypeScript application layer.

## Design / patterns

- `bin/ctxindex.mjs` is a minimal executable adapter; all registration, orchestration, and formatting live under `src/`.
- `package.json` declares the public unscoped ESM `ctxindex` package with canonical project and issue-tracker links, maps the `ctxindex` bin to `dist/ctxindex.mjs`, pins Bun 1.3.14, and delegates `build:package` to `scripts/release/build-cli-package.ts`. That builder injects the package version, keeps `keytar` external, rewrites selected Pino/thread-stream path lookups for relocation, rejects source-checkout paths in the bundle, and writes the executable output. `package.json` also owns lint, format, typecheck, test, clean/fullclean, and marker-aware `cli` tasks.
- The package follows a layered CLI architecture: executable shim -> citty composition root -> parser/handler/workflow modules -> direct core services or the private daemon RPC client -> output adapters; secret-backend policy remains in core rather than command handlers.

## Data & control flow

1. Bun starts `apps/cli/bin/ctxindex.mjs` with process argv.
2. The shim calls `apps/cli/src/main.ts#runCli(process.argv.slice(2))`.
3. `runCli` dispatches through the command tree with a build-injected `__CTXINDEX_VERSION__`, falling back to `0.0.0` outside the bundle. Handlers fully parse locally decidable arguments before dependency or transport work. Realm, Source, Action run/source-aware describe, sync, status, search, get, thread, and Extension-documentation commands ensure exact-tuple daemon readiness or a test endpoint, with no selected-route fallback; unsupported platforms retain direct stateful dependencies behind explicit initialization and a shared database lease. Account onboarding uses a policy-matched managed App when `--app` is omitted or an exact explicitly selected Extension/local App, then binds the resulting Account to a Source. `daemon start/status/stop` remain explicit lifecycle controls beside ordinary on-demand startup.
4. The returned numeric status is assigned to `process.exitCode` by the shim.

## Integration points

- Invoked from the repository's `package.json` script `cli` or the package-local `apps/cli/package.json` script `cli`; both route through `scripts/cli.sh` so helper-created worktrees isolate state.
- Private workspace and JavaScript dependencies remain build-time development inputs bundled into `dist/ctxindex.mjs`; the staged npm manifest retains only native `keytar@7.9.0` as an external runtime dependency.
- Workspace dependencies add separate `@ctxindex/local-daemon` discovery/lease infrastructure and `@ctxindex/rpc` wire contracts; `@orpc/client` supplies the Bun Unix-socket client link without importing the daemon application.
- Detailed maps: `apps/cli/bin/codemap.md` and `apps/cli/src/codemap.md`.
