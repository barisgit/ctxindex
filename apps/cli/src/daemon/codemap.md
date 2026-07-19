# apps/cli/src/daemon/

## Responsibility

Implements the CLI-owned Bun Unix-socket RPC adapter, exact runtime discovery selection, lifecycle command projection, and explicit foreground daemon launcher.

## Design / patterns

- `client.ts` derives the canonical config/data/state/cache identity through `@ctxindex/local-daemon`, selects only exact matching metadata or `CTXINDEX_DAEMON_TEST_ENDPOINT`, and constructs a typed `@orpc/client` link with explicit protocol/runtime headers.
- Selected transport failures become bounded `DaemonCliError` values; aborted caller signals remain cancellation, and no selected request falls back to direct composition.
- `command.ts` exposes `serve`, `health`, and `shutdown`. Serve uses the current pinned Bun executable plus the source entrypoint during development, or an explicit/sibling `ctxindex-daemon` executable when compiled, and forwards termination signals; it never consults ambient PATH, detaches, or autostarts from ordinary commands.

## Data & control flow

Realm/Source management, sync/status, search, exact get, and thread parse locally, call `selectDaemon()`, and invoke semantic typed procedures only when selected; none opens SQLite or falls back after selection. Source add requests the daemon's active definition projection before parsing generated flags. Health/shutdown require a selector.

## Integration points

Consumed by `main.ts`, Realm/Source/search/get/thread/status commands, and `sync/runner.ts`. Depends on `@ctxindex/rpc` and `@ctxindex/local-daemon` separately and never imports `apps/daemon` or `@ctxindex/daemon`.
