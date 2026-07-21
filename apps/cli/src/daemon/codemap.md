# apps/cli/src/daemon/

## Responsibility

Implements the CLI-owned Bun Unix-socket RPC adapter, exact runtime discovery selection, and explicit detached background daemon lifecycle.

## Design / patterns

- `client.ts` derives the canonical config/data/state/cache identity through `@ctxindex/local-daemon`, selects only exact matching metadata or `CTXINDEX_DAEMON_TEST_ENDPOINT`, and constructs a typed `@orpc/client` link with explicit protocol/runtime headers.
- `ensure.ts` verifies initialization evidence before every stateful ensure, shares one in-process lifecycle attempt, verifies an already selected endpoint, starts the exact compatible daemon when absent or stale, preserves caller-local cancellation, and returns an explicit unsupported result for the retained direct-platform path. A selected route carries one reconnect capability for a declared pre-admission stopping rejection; command execution never falls back to direct composition.
- `client.ts` returns plain typed procedure values without an RPC envelope. Export preparation consumes the opaque ticket once over the selected Unix socket, validates exact byte length, and provides private no-overwrite atomic destination publication. For streamed sync it manually consumes `next()` to retain the terminal return, awaits an optional event sink, and returns the iterator on cancellation/cleanup. It converts only declared oRPC failures whose defined status, constant outer message, registry-derived strict `RpcFailure` data, and matching kind/code validate. Only a declared `daemon_unavailable` before admission may reconnect once; ambiguous transport failures and a second rejection are never replayed. Unknown selected transport/protocol failures become `daemon_unavailable`, aborted caller signals remain cancellation, and no selected request falls back to direct composition.
- `lifecycle.ts` owns exact source/packaged sibling resolution, detached launch, owner-private startup diagnostics, monotonic health/shutdown bounds, idempotent graceful stop, and lease-proven stale-state cleanup. Startup waits within its existing total bound for a transitional owner to become ready or release before launching a replacement. Health-probe cancellation is terminal for start/status/stop and cannot be reclassified as absence. Its outer action boundary preserves typed daemon/cancellation/pre-init failures and sanitizes unexpected runtime/discovery host errors before CLI rendering. PID metadata is observational only. `command.ts` exposes only `start`, `status`, and `stop` through `defineCtxCommand` and formats their deterministic readable/JSON results.

## Data & control flow

Command descriptors and the shared command model validate locally before Realm/Source management, secret-backend status/set, Action run/source-aware describe, sync/status, search, exact get, thread, and Extension-documentation operations ensure the daemon and invoke semantic typed procedures when supported; none opens SQLite or falls back after a successful ensure. Unsupported platforms retain the bounded direct route until their lease backend is available. Source add requests the daemon's active definition projection before resolving generated flags. Secret responses carry only aggregate availability/reference counts, copy/cleanup counts, and bounded warnings. Documentation requests receive only bounded portable rows, text, snippets, or Base64 assets. Explicit lifecycle commands remain available beside ordinary on-demand startup.

## Integration points

Consumed by `main.ts`, Realm/Source/Secrets/Action/search/get/thread/status commands, documentation routing, and `sync/runner.ts`. Depends on `@ctxindex/rpc` and `@ctxindex/local-daemon` separately and never imports `apps/daemon` or `@ctxindex/daemon`.
