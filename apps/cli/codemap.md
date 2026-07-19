# apps/cli/

## Responsibility

Packages the Bun-executed `ctxindex` command-line application, from its executable shim to the TypeScript application layer.

## Design / patterns

- `bin/ctxindex.mjs` is a minimal executable adapter; all registration, orchestration, and formatting live under `src/`.
- `package.json` declares a private ESM workspace package, exports `src/main.ts`, and owns the build, lint, format, typecheck, test, clean/fullclean, and marker-aware `cli` tasks dispatched from the repository root through Turbo or the shared CLI launcher.
- The package follows a layered CLI architecture: executable shim -> citty composition root -> parser/handler/workflow modules -> core services -> output adapters; secret-backend policy remains in core rather than command handlers.

## Data & control flow

1. Bun starts `apps/cli/bin/ctxindex.mjs` with process argv.
2. The shim calls `apps/cli/src/main.ts#runCli(process.argv.slice(2))`.
3. `runCli` dispatches through the command tree; database-backed handlers require the config written by explicit `init` before opening SQLite, and Client handling checks before reading declared credential environments. Handlers then load dependencies and definitions, invoke core behavior, and format output. Action descriptions preserve registry-derived strict unions by rendering each `oneOf`/`anyOf` alternative as a numbered text or Markdown branch, so standalone and threaded-reply Draft inputs remain inspectable. `extensions catalog` delegates Git acquisition and persisted provenance to core: list/show/install refresh by default, `--no-refresh` reads stored snapshots, and startup remains offline. `client` imports declared environment credentials once, `account` performs consent with a persisted client, and labeled Sources bind the resulting stable Grant. `init` asks core to select a backend only for a fresh config, while `secrets status` and `secrets backend set` use focused secret dependencies.
4. The returned numeric status is assigned to `process.exitCode` by the shim.

## Integration points

- Invoked from the repository's `package.json` script `cli` or the package-local `apps/cli/package.json` script `cli`; both route through `scripts/cli.sh` so helper-created worktrees isolate state.
- Workspace dependencies are `@ctxindex/adapters`, `@ctxindex/core`, and `@ctxindex/extension-sdk`; runtime presentation/framework dependencies are `citty` and `cli-table3`, while colocated definition fixtures use Zod.
- Detailed maps: `apps/cli/bin/codemap.md` and `apps/cli/src/codemap.md`.
