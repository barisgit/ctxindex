# packages/rpc/src/

## Responsibility

Defines the owner-private local daemon's schema-first oRPC contract, strict bounded wire DTOs, contract-derived client/application types, declared failure registry, and transport-independent router adaptation.

## Design / patterns

- `schemas.ts` is the authoritative strict Zod boundary for protocol/runtime identity, inputs, outputs, failures, count-only sync events, safe aggregate secret-backend status/switch results, and bounded source-aware Action describe/run values.
- `contract.ts` composes procedures without handlers; `sync.run` uses oRPC `eventIterator` for typed yields plus one typed terminal result.
- `router.ts` recursively derives the daemon application interface from the contract. Unary and stream adapters validate application results and map only the shared registry's declared failures.
- Stream yields and terminal values are parsed again at the application boundary. Unsafe or malformed values collapse to one bounded internal error rather than entering transport serialization.

## Data & control flow

1. The CLI constructs the contract-derived client and supplies exact protocol/runtime headers.
2. Compatibility middleware validates transport context before application delegation.
3. Unary procedures, including secret-backend status/set and Action describe/run, unwrap one `RpcResult`; streamed sync unwraps an application iterator whose terminal value is an `RpcResult`.
4. Each sync event is validated and yielded in order. Iterator return/cancellation is forwarded to the application iterator; a validated terminal success is returned and a validated terminal failure becomes one declared oRPC error.

## Integration points

Consumed separately by `apps/cli` and `apps/daemon`; it imports neither core business types nor daemon implementation. Bun Unix-socket transport lives in `apps/daemon`, while runtime discovery/identity lives in `@ctxindex/local-daemon`.
