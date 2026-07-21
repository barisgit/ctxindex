## Context

The daemon contract is schema-first and unary. Core sync already consumes an
Adapter's async emissions with awaited backpressure, but the application service
does not expose progress and the RPC call returns only after all Sources settle.
oRPC 1.14.8 supports validated event iterators whose yields and final return are
separately typed and transported over the existing Fetch/Unix-socket link.

The CLI is the public integration surface. Existing JSON callers expect one final
document and existing per-Source failures are values in the aggregate sync result,
not transport failures.

## Goals / Non-Goals

**Goals:**

- Produce useful live sync progress without exposing provider payloads or cursors.
- Preserve ordered delivery, natural backpressure, cancellation, transactional
  sync semantics, final output shapes, and stable exits.
- Establish a reusable private-RPC streaming pattern for later long operations.

**Non-Goals:**

- Streaming search, retrieval, exports, or Artifact bytes in this change.
- Public RPC/SDK compatibility, remote transport, batching, queues, persistence,
  resumable streams, or daemon lifecycle automation.
- Parallelizing the currently deterministic sequential multi-Source sync.

## Decisions

### 1. The sync procedure returns an oRPC event iterator

The iterator yields a closed progress union and returns the existing aggregate
sync result. The final result is not repeated as a yield. A declared oRPC failure
before or during iteration remains an error, while ordinary per-Source failures
remain bounded result values. This preserves the established error taxonomy and
uses oRPC's native validation/transport rather than a polling or bespoke framing
protocol.

### 2. Core exposes one awaited observer, not transport concepts

The sync application input accepts an optional awaited progress observer. Core
emits Source start, count-only Adapter-emission progress, and Source terminal
events in execution order. The Sync Coordinator reports cumulative observed
upsert, removal, checkpoint, and warning counts after each validated emission.
It exposes no Resource, Ref, cursor, provider response, path, or credential.

Awaiting the observer carries consumer backpressure through application service,
coordinator, and Adapter `emit`. Direct callers that omit the observer retain the
same behavior and result.

### 3. A zero-unbounded-buffer bridge adapts callbacks to iteration

The daemon application owns a one-item rendezvous between the core observer and
the returned async iterator. The producer cannot outpace the consumer. Iterator
return, request cancellation, client disconnect, or daemon shutdown aborts the
operation and settles the producer before request tracking is released.

### 4. CLI machine output stays atomic

`sync --format json` consumes progress silently and emits exactly one existing final JSON
document. `--format events` emits each progress event immediately and retains the
existing Source terminal event shapes. Human summary/compact modes report bounded
progress on stderr and retain their terminal stdout forms. Exit selection remains
derived from the terminal per-Source results.

## Risks / Trade-offs

- [One event per Adapter emission can increase local protocol traffic] -> Events
  contain only cumulative counts, use backpressure, and the CLI may coalesce human
  rendering without changing contract delivery.
- [Iterator cleanup can race producer settlement] -> One request-scoped abort
  controller owns both sides; iterator finalization aborts and awaits the producer.
- [Streaming output validation differs from unary validation] -> The one contract
  remains authoritative for yield/return schemas and focused hostile-value tests
  cover both phases.
- [A Source may emit nothing for a long provider call] -> Source start is immediate;
  provider-specific heartbeat fabrication is intentionally excluded.

## Migration Plan

No persistent state changes. The incompatible unary-to-stream wire change advances
the private exact-versioned daemon protocol from version 1 to version 2. Updated
clients therefore reject stale unary daemons, and updated daemons reject stale
clients, before procedure dispatch. No compatibility alias is retained.

## Open Questions

None.
