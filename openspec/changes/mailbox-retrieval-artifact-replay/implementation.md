## Capability Implementation Targets

- `retrieval-and-artifacts` → `openspec/specs/retrieval-and-artifacts/implementation.md`

## Module Ownership

This test-only change introduces no durable production module ownership or dependency direction. The existing boundary remains unchanged: Profiles own message relations, Artifact descriptors, and exports; Adapters own provider retrieval and download I/O; core owns ad-hoc Resource materialization and the managed Artifact store; the CLI delegates through those generic services.

The acceptance harness belongs to CLI end-to-end testing. Its shared runner owns provider-neutral assertions, while narrow test drivers adapt invented Gmail and Graph loopback setup and expose credential-free route counts.

## Interfaces and Data Flow

No public or internal production interface changes. The test harness compiles the existing CLI entrypoint once, spawns a new process for every command, and retains only isolated on-disk ctxindex state between phases. Existing configurable provider mocks remain unmodified and receive invented fixture values through their current test-only options.

The replay data flow is remote search to stable Ref, on-demand complete retrieval to an ad-hoc Resource, local retrieval reuse, Artifact download into the managed store, cached output copy, explicit purge, provider re-fetch, and offline Profile export. Failures are observed only through existing CLI exits and provider route counts.

## Storage and State

Production storage ownership is unchanged. Each provider replay receives one isolated XDG/ctxindex state tree. Fresh CLI processes open that same provider-local state, while Google and Microsoft replay state never overlaps. Provider mock state and route counters are ephemeral test state.

## Security and Compatibility

All provider traffic is loopback-only. Fixture identities use reserved `.test` domains and obviously invented content. Compiled child processes receive only the explicitly constructed isolated/mock environment plus the minimal runtime `PATH`; they never inherit the full parent environment, `HOME`, unrelated provider configuration, auth tokens, or credentials. The harness must not inspect or persist authorization headers, token values, request bodies, secrets, or provider payload recordings. Route assertions are limited to exact method/path/query shapes known to contain no credentials.

This evidence makes no compatibility or fidelity claim about live provider payloads and must not be used as a substitute for issue #4. No schema, provider scope, runtime behavior, or migration changes are permitted.

## Verification

Focused verification runs the new shared replay for both providers and proves every process boundary, route-count invariant, exact byte comparison, purge/re-fetch, offline export, and invalid-Ref zero-I/O assertion. A focused key-only assertion proves representative ambient credential/config variables are absent from the exact child environment without printing their values. Privacy self-review searches new fixtures for non-`.test` email domains, captured-provider markers, and secret-like values. Cross-cutting gates remain the full repository CI, strict OpenSpec validation, and OpenSpec implementation verification.

## Promotion Notes

No canonical implementation doctrine must be promoted before archive. The change adds acceptance evidence for the existing `retrieval-and-artifacts` technical shape without changing that shape; the canonical sidecar already owns retrieval, Artifact persistence/service, thread, export, storage, and verification boundaries.
