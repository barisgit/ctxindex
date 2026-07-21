# Daemon Operation Streams Implementation Doctrine

> This sidecar records intended-implementation doctrine. It is reference-level, not normative behavior; behavioral requirements live in [spec.md](spec.md) after the corresponding OpenSpec change is archived.

## Interfaces

### @ctxindex/rpc — contract and application seam

```ts
export const rpcSyncEventSchema = z.discriminatedUnion('type', [
  sourceStartedSchema,
  sourceProgressSchema,
  sourceCompletedSchema,
  sourceFailedSchema,
])

export const daemonContract = {
  sync: {
    run: procedure
      .input(rpcSyncInputSchema)
      .output(eventIterator(rpcSyncEventSchema, rpcSyncResultSchema)),
  },
} as const

type ApplicationOutput<Output> =
  Output extends AsyncIterator<infer Yield, infer Return, infer Next>
    ? AsyncIteratorObject<Yield, RpcResult<Return>, Next>
    : Output
```

The contract is authoritative for client and application inference. The application returns an iterator whose terminal value is the existing `RpcResult`; the router adapts that terminal value into either the contract return or one registry-declared oRPC error. No parallel handler contract or failure registry is maintained.

## Stream adaptation

Both yielded events and terminal results are parsed through the same exported strict RPC schemas used by the contract. A malformed value, application throw, or undeclared failure becomes the bounded `ctxindex/internal_error`; the unsafe value is never returned to the transport.

Daemon operation producers use a one-item rendezvous rather than an accumulating event queue. An awaited observer can produce the next event only after the current event has been consumed. Iterator `return()`, transport cancellation, client disconnect, and daemon shutdown abort the request controller, close the rendezvous, await producer settlement, and release active-request tracking. Finalization is effective even before the first `next()` call.

Progress events contain only bounded sequence/count fields and public identifiers. Terminal Source projections reuse the established bounded warning/failure DTOs. Resource payloads, provider bodies, cursors, raw paths, Error objects, stacks, causes, and secrets never enter the event schema.

## Compatibility

Streaming replaces the owner-private unreleased unary sync procedure without a compatibility alias. The exact protocol advances from version 1 to version 2 so stale unary peers fail before dispatch. The existing terminal sync result and failure taxonomy remain unchanged. No durable queue or state is introduced; operation stream state is request-scoped and in memory.

## Verification

RPC tests cover inferred iterator types, ordered yield/return validation, malformed-value redaction, declared terminal failures, and early return. Daemon tests cover rendezvous backpressure, cancellation, safe projection, and request settlement. The compiled daemon test proves streaming through the real Unix-socket transport and CLI.
