## Why

Long-running daemon operations currently use unary RPC, so `sync` produces no
observable progress until every selected Source has finished. This makes the
normal agent workflow appear hung, delays cancellation cleanup until an opaque
request settles, and makes the existing `--format events` output a retrospective
render rather than a real event stream. The accepted daemon boundary needs a
typed streaming contract before more long-running operations are migrated.

## What Changes

- Replace the private daemon sync procedure's unary success value with a typed
  event iterator that yields bounded ordered progress and returns the existing
  terminal sync result.
- Expose provider-neutral sync lifecycle and count-only progress from the core
  sync application service without transporting Resource payloads, cursors,
  provider bodies, paths, or secrets.
- Make cancellation or client disconnect abort the producer, release iterator
  resources, and preserve existing transactional Sync Run bookkeeping.
- Preserve one final JSON document for `sync --format json`; make `--format events`
  render events as they arrive while summary and compact formats retain their
  existing terminal shapes.
- Keep the private protocol exact-versioned and the CLI as the only supported
  agent-facing integration surface.

## Capabilities

### New Capabilities

- `daemon-operation-streams`: Typed bounded private-RPC event iteration,
  terminal outcomes, backpressure, and cancellation/disconnect cleanup.

### Modified Capabilities

- `sync-operations`: Provider-neutral observable sync progress and its ordering
  relative to Source completion and the terminal aggregate result.
- `cli-surface`: Live events rendering with stable final JSON and exit behavior.

## Impact

- Extends `@ctxindex/core` sync orchestration, `@ctxindex/rpc`, `apps/daemon`,
  and the CLI daemon client/renderer.
- Uses the installed oRPC event-iterator transport over the existing owner-private
  Unix socket; it adds no public RPC, SDK, network listener, queue, or schema
  migration.
- Requires focused contract, application, transport, cancellation, CLI, and
  compiled daemon coverage.
