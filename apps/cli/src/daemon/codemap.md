# apps/cli/src/daemon/

## Responsibility

Implements the CLI-owned Bun Unix-socket RPC adapter, exact runtime discovery selection, and explicit detached background daemon lifecycle.

## Design / patterns

- `client.ts` derives the canonical config/data/state/cache identity through `@ctxindex/local-daemon`, selects only exact matching metadata or `CTXINDEX_DAEMON_TEST_ENDPOINT`, and constructs a typed `@orpc/client` link with explicit protocol/runtime headers.
- `client.ts` returns plain typed procedure values without an RPC envelope. For streamed sync it manually consumes `next()` to retain the terminal return, awaits an optional event sink, and returns the iterator on cancellation/cleanup. It converts only declared oRPC failures whose defined status, constant outer message, registry-derived strict `RpcFailure` data, and matching kind/code validate; unknown selected transport/protocol failures become `daemon_unavailable`. Aborted caller signals remain cancellation, and no selected request falls back to direct composition.
- `lifecycle.ts` owns exact source/packaged sibling resolution, detached launch, owner-private startup diagnostics, monotonic health/shutdown bounds, idempotent graceful stop, and lease-proven stale-state cleanup. Its outer action boundary preserves typed daemon/cancellation/pre-init failures and sanitizes unexpected runtime/discovery host errors before CLI rendering. PID metadata is observational only. `command.ts` exposes only `start`, `status`, and `stop` through `defineCtxCommand` and formats their deterministic readable/JSON results.

## Data & control flow

Command descriptors and the shared command model validate locally before Realm/Source management, sync/status, search, exact get, thread, and Extension-documentation operations call `selectDaemon()` and invoke semantic typed procedures only when selected; none opens SQLite or falls back after selection. Source add requests the daemon's active definition projection before resolving generated flags. Documentation requests receive only bounded portable rows, text, snippets, or Base64 assets. Lifecycle commands manage a detached process explicitly; ordinary-command autostart remains disabled until full stateful parity.

## Integration points

Consumed by `main.ts`, Realm/Source/search/get/thread/status commands, and `sync/runner.ts`. Depends on `@ctxindex/rpc` and `@ctxindex/local-daemon` separately and never imports `apps/daemon` or `@ctxindex/daemon`.
