## Capability Implementation Targets

- `daemon-operation-streams` → `openspec/specs/daemon-operation-streams/implementation.md`
- `sync-operations` → `openspec/specs/sync-operations/implementation.md`
- `cli-surface` → `openspec/specs/cli-surface/implementation.md`

## Module Ownership

`@ctxindex/core` owns provider-neutral sync event vocabulary and ordered awaited
observation. `@ctxindex/rpc` owns the oRPC `eventIterator` contract, strict bounded
transport schemas, contract-derived application/client types, failure registry,
and generic stream adaptation. `apps/daemon` projects core events into safe DTOs,
tracks the stream as one active business request, and bridges observer backpressure
to async iteration. `apps/cli` consumes the private iterator and owns rendering,
JSON atomicity, cancellation, and exit selection.

RPC does not import core sync types or business behavior. Core does not import
RPC/oRPC. The CLI does not import daemon application code or open its database
after selecting a daemon.

## Interfaces and Data Flow

Core extends `RunSyncInput` with an optional awaited `onEvent` observer and adds a
closed `SyncApplicationEvent` union. `SyncSourceInput` and `SyncRunInput` carry an
optional awaited count-only progress observer. Coordinator counts are cumulative
and observed, not committed-state claims.

The contract declares `sync.run` output with oRPC `eventIterator(yieldSchema,
returnSchema)`. Yield and return types derive from that contract. The recursively
derived daemon application type recognizes iterator output schemas and models an
application iterator whose terminal return is the existing `RpcResult`; the router
unwraps that terminal result into either the contract return or one declared oRPC
error. Unary procedures retain the same derived shape and helper.

The daemon application creates one request-scoped iterator. Its one-item rendezvous
awaits consumption before accepting another core event. Finalization aborts the
request controller, returns the core result/failure through the iterator terminal,
awaits producer settlement, removes cancellation listeners, and releases active
request tracking.

The CLI daemon client manually consumes `next()` so it retains the iterator's typed
terminal return. It calls an optional awaited event sink, calls `return()` during
cleanup, and normalizes declared/transport/cancellation failures through the same
existing daemon failure boundary. The sync runner maps core and RPC events into one
CLI event vocabulary; JSON suppresses live writes and emits the terminal object.

## Storage and State

No durable state is added. Stream queues, counters, controllers, and producer tasks
are request-scoped ephemeral state. Existing Sync Coordinator transactions, locks,
run rows, cursor advancement, rollback, and failure diagnostics remain authoritative.

## Security and Compatibility

RPC event schemas permit only ids, modes, bounded sequence/count values, bounded
public warnings, and bounded safe Source terminal projections. They exclude
payloads, cursors, provider text beyond the existing public warning projection,
paths, Error objects, stacks, causes, and secrets.

The protocol remains owner-private, local-only, exact-versioned, and unreleased.
The unary-to-stream wire change advances it from version 1 to version 2 so stale
clients and daemons fail compatibility checks before dispatch. The public CLI
terminal JSON/result/exit contract remains stable. No legacy unary sync alias or
compatibility branch is retained.

## Verification

Core tests cover event order, cumulative counts, warning/failure sequencing,
backpressure, and observer omission parity. RPC tests cover derived iterator types,
yield/return validation, declared mid-stream errors, early return, and signal
identity. Daemon tests cover bounded projection, active-request lifetime,
cancellation/disconnect cleanup, and no unsafe leakage. CLI tests cover immediate
events, atomic JSON, terminal formatting/exits, no direct fallback, and cancellation.
The compiled daemon journey proves Unix-socket event transport. Repository gates
remain `bun run ci` and `bunx openspec validate --all --strict`.

## Promotion Notes

- Create `daemon-operation-streams/implementation.md` with contract-derived oRPC
  iterator adaptation, bounded rendezvous backpressure, terminal failure mapping,
  and cleanup doctrine.
- Extend `sync-operations/implementation.md` with the core observer interfaces,
  cumulative count semantics, and Adapter-emission backpressure flow.
- Extend `cli-surface/implementation.md` with private iterator consumption, atomic
  JSON, live event rendering, cancellation, no-fallback, and terminal exit ownership.
