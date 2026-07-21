## Context

Provider-specific Adapter tests exercise paging, cursor invalidation, and reconciliation, while CLI workflows prove selected calendar paths. The missing evidence is one repeated persisted lifecycle applied identically to both calendar providers. The issue constrains this work to synthetic loopback infrastructure and forbids production recording, live authentication, public API changes, and changes to persistence semantics.

## Goals / Non-Goals

**Goals:**

- Run the same ordered sync phases for Google Calendar and the default Microsoft Calendar.
- Start a fresh CLI process for every phase while retaining one isolated state directory per provider replay.
- Assert counters, cursor advancement/replacement, stable Refs, Resource materialization, tombstones, warnings, and bounded redacted provider reads.
- Keep provider variation behind a small test driver for mock setup, state transition, cursor expiry, and request inspection.

**Non-Goals:**

- Production provider behavior, cursor/schema/counter changes, new CLI commands, or public test APIs.
- Live credentials, provider data, recordings, cassettes, sanitizers, mailbox sync, daemons, schedulers, or additional providers.

## Decisions

1. Use one test-only phase runner parameterized by a provider driver. This makes lifecycle assertions provider-neutral while preserving the provider wire differences at the mock boundary. Separate provider workflows were rejected because they would allow the scenarios to drift.
2. Store invented provider-shaped event snapshots in a dedicated checked-in fixture module. Identities use `.test`, content is intentionally synthetic, and fixtures contain no authentication material or captured request metadata.
3. Exercise the development CLI entrypoint through the existing isolated sandbox helper. Each command invocation creates a new child process, while the sandbox's XDG directories preserve only the intended cross-run state.
4. Inspect generic persisted state through read-only SQLite queries and provider traffic through existing redacted mock request records. Provider cursors are compared only for equality/change as opaque serialized values; their internal fields and token/link syntax are not asserted.
5. Use the existing Google and Graph loopback servers and their mutation/expiry controls. Production recording or generalized cassette infrastructure is unnecessary for two deterministic in-memory provider simulations.

## Risks / Trade-offs

- [Direct read-only database assertions couple the test to existing internal table names] → Limit queries to the persisted invariants the issue explicitly requires and add no exported production inspection API.
- [A long end-to-end replay can be slower or harder to diagnose] → Keep exactly one shared lifecycle, label each phase, and retain focused Adapter tests as the lower-level diagnostic lane.
- [Provider mocks could accidentally expose cursor structure to the common harness] → Keep request-route inspection in the provider driver and expose only opaque cursor equality/change assertions to the shared runner.

## Migration Plan

Not applicable. The change affects test files and OpenSpec artifacts only; no deployed or persisted user state changes.

## Open Questions

None.
