# apps/cli/src/daemon/

## Responsibility

Implements the CLI-owned Bun Unix-socket RPC adapter, exact runtime discovery selection, lifecycle command projection, and explicit foreground daemon launcher.

## Design / patterns

- `client.ts` derives the canonical config/data/state/cache identity through `@ctxindex/local-daemon`, selects only exact matching metadata or `CTXINDEX_DAEMON_TEST_ENDPOINT`, and constructs a typed `@orpc/client` link with explicit protocol/runtime headers.
- `client.ts` returns plain typed procedure values without an RPC envelope. It converts only declared oRPC failures whose defined status, constant outer message, registry-derived strict `RpcFailure` data, and matching kind/code validate; unknown selected transport/protocol failures become `daemon_unavailable`. Aborted caller signals remain cancellation, and no selected request falls back to direct composition.
- `command.ts` exposes `serve`, `health`, and `shutdown` through `defineCtxCommand`, then passes a typed `DaemonCommandInput` to lifecycle execution. Serve uses the current pinned Bun executable plus the source entrypoint during development, or an explicit/sibling `ctxindex-daemon` executable when compiled, and forwards termination signals; it never consults ambient PATH, detaches, or autostarts from ordinary commands.

## Data & control flow

Command descriptors and the shared command model validate locally before Realm/Source management, sync/status, search, exact get, thread, and Extension-documentation operations call `selectDaemon()` and invoke semantic typed procedures only when selected; none opens SQLite or falls back after selection. Source add requests the daemon's active definition projection before resolving generated flags. Documentation requests receive only bounded portable rows, text, snippets, or Base64 assets. Health/shutdown require a selector.

## Integration points

Consumed by `main.ts`, Realm/Source/search/get/thread/status commands, and `sync/runner.ts`. Depends on `@ctxindex/rpc` and `@ctxindex/local-daemon` separately and never imports `apps/daemon` or `@ctxindex/daemon`.
