## Context

The two bundled mailbox Adapters share provider-neutral contracts but have uneven whole-stack evidence. Gmail end-to-end coverage proves remote search and cached retrieval; Outlook additionally proves attachment discovery, exact download bytes, managed-cache reuse, and exports. The change must close that evidence gap without captured provider data, live authentication, production changes, or mailbox projection semantics. The compiled CLI is the external integration surface, so every replay phase must cross a fresh process boundary while retaining only its provider-local isolated state.

## Goals / Non-Goals

**Goals:**

- Apply one shared retrieval, Artifact, purge, export, and invalid-Ref lifecycle to Google and Microsoft mailbox Sources.
- Use obviously invented provider-shaped fixtures, reserved `.test` identities, loopback-only traffic, and bounded redacted route inspection.
- Prove durable behavior across fresh invocations of one compiled and relocated CLI executable.
- Keep provider-specific code limited to fixture setup, exact safe route classification, and request-count inspection.

**Non-Goals:**

- Reproducing, sanitizing, replacing, or making claims about issue #4 live mailbox data.
- Mailbox sync, cursors, enumeration pagination, reconciliation, tombstones, routing changes, local projection, or background scheduling.
- Production API, schema, CLI, Adapter, Profile, attachment-kind, Draft, daemon, concurrency, or retry changes.

## Decisions

1. Compile and relocate the CLI once per test file, then spawn a new executable process for every setup and replay command. This proves the packaged boundary without repeatedly paying compilation cost; an in-process command runner was rejected because it cannot prove process-local caches are irrelevant.
2. Run the same ordered lifecycle through a small provider driver. Shared assertions own Resource, Relation, Artifact, export, and failure semantics. Drivers may only start an existing loopback mock with invented data, supply its isolated environment, classify exact credential-free routes, and report request counts. Separate provider workflows were rejected because their assertions could drift.
3. Give each provider replay its own isolated XDG state directory and pass child processes only the explicitly constructed test environment. The harness may reuse the parent `PATH` solely to find the pinned runtime and loopback browser shim, but it never forwards `HOME`, provider configuration, auth tokens, credentials, or the full ambient environment. Provider state is retained across that provider's fresh CLI processes and never shared across providers. This avoids ambient credential access and cross-provider storage interactions that are outside the issue.
4. Use existing configurable Gmail and Graph loopback servers without editing their shared implementations. New fixtures and the replay harness remain additive. Generalizing mocks or copying captured responses is unnecessary.
5. Compare only exact safe request route shapes and counts. Authorization values, tokens, request bodies, and provider response payloads are never recorded or asserted. Offline phases use a deliberately unreachable loopback base URL in a fresh process so cache/export success cannot be attributed to the live mock.
6. Treat the delta as automated acceptance evidence for existing contracts. Production behavior remains unchanged, and any test that exposes a production defect stops this change for separate diagnosis rather than broadening the issue.

## Risks / Trade-offs

- [The shared lifecycle overlaps provider-specific end-to-end tests] -> Assert only cross-provider contract parity and the currently missing Gmail Artifact lifecycle; retain focused tests as diagnostics.
- [One long compiled replay can be slow or hard to diagnose] -> Keep phases explicit, run one parameterized provider case at a time, and report the command in assertion failures.
- [Mock request inspection could leak sensitive-shaped values] -> Expose only method/path/query and counts from invented loopback traffic; never snapshot headers, bodies, or credentials.
- [A compiled child could inherit unrelated ambient credentials] -> Construct its environment exclusively from isolated XDG roots, the minimal runtime path, loopback mock endpoints, the keychain mock, and synthetic client inputs; assert dangerous ambient keys are absent without reading or printing their values.
- [Existing mock behavior may not support a required negative boundary] -> Use a test-local malformed Ref and zero-I/O count assertion; do not modify production or shared mocks to manufacture behavior.

## Migration Plan

Not applicable. The change affects test and OpenSpec files only.

## Open Questions

None.
