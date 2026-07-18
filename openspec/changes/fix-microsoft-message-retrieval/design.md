## Context

A bounded read-only checkpoint against an already-configured Microsoft mailbox Source reproduced the failure without exposing provider data. Two identical searches returned the same five canonical Refs. The selected immutable id was 128–255 characters, canonically percent-encoded, and contained a decoded trailing `=`. Instrumentation at the existing egress chokepoint then showed two requests: exact message retrieval succeeded with HTTP 200, while the following attachment metadata request failed with HTTP 400 and Graph code `BadRequest`. The provider wording referenced `@odata.type` and OData select/expand, and both request identifiers were present. Current transport handling retains only the HTTP status, and the loopback mock accepts the request Graph rejects.

The change must keep provider evidence private, preserve the CLI's normalized exit taxonomy, remain inside the existing Adapter and egress boundaries, and use synthetic replay data only.

## Goals / Non-Goals

**Goals:**

- Make a fresh Microsoft search Ref complete generic `get` hydration when the message has attachments.
- Hydrate all bounded attachment metadata pages with a Graph-compatible request and expose file descriptors through the generic Artifact workflow.
- Make Graph failures actionable without disclosing raw provider bodies, identifiers, or message data.
- Reproduce the observed request and immutable-id encoding shape using deterministic synthetic fixtures.

**Non-Goals:**

- Mail send, attachment mutation, reply support, or any provider mutation beyond existing Draft behavior.
- A second HTTP client, Graph Explorer, or bypass of the ctxindex egress boundary.
- Migration of disposable pre-alpha cache rows or compatibility aliases.
- General mailbox enumeration or unbounded provider pagination.

## Decisions

1. **Treat attachment hydration, not immutable-id retrieval, as the failing operation.** The replay will require exact message retrieval to succeed before rejecting the observed attachment metadata query. This prevents a mock from attributing the 400 to the wrong request and preserves the evidence that the searched immutable id is valid.

2. **Retain a narrow attachment projection but exclude the OData type annotation from the selection expression.** Graph returns attachment type annotations as response metadata, but rejects selecting `@odata.type` as a property. Omitting only that annotation keeps payloads bounded and preserves file-versus-non-file normalization. Removing the projection entirely would fetch unnecessary attachment data, while changing identifier encoding would address a request that already succeeds.

3. **Do not publish Graph attachment `size` as exact Artifact metadata.** Exchange derives this field from the aggregate attachment object, so it can exceed the raw `$value` byte count even though Graph documents it as bytes. Retrieval excludes the unused approximate field from its projection and omits `Artifact.byteSize`; the managed content-addressed store records the exact streamed count after download. This sacrifices a pre-download estimate rather than publishing a false integrity constraint that rejects valid bytes.

4. **Parse failure diagnostics once at the shared Microsoft transport boundary.** Error handling will retain status-to-taxonomy mapping while adding a strictly validated Graph code, a fixed safe wording classification for recognized technical failures, and redacted indicators when Graph request identifiers are present. Arbitrary provider wording and identifier values will not cross the boundary; unknown wording is withheld.

5. **Use complementary test seams.** Adapter tests will prove the exact query/header/encoding behavior, approximate-size handling, and diagnostic redaction. The loopback Graph replay will reject the formerly accepted select expression and prove the compiled provider-neutral search, get, paged Artifact listing, exact-byte download, and cache-reuse workflow.

6. **Keep live verification as a separate Human checkpoint.** Automated coverage uses synthetic loopback fixtures. A post-fix live search/get/artifact check will occur only with explicit approval and will retain redacted evidence under the ignored operator-artifact boundary.

## Risks / Trade-offs

- **Graph error bodies may vary by endpoint or tenant** → Parse only a bounded structural envelope, validate codes, classify recognized technical wording, and withhold all unknown text.
- **A permissive mock could regress again** → Make the replay reject `@odata.type` in select/expand and assert the complete request sequence.
- **Paged attachment handling could partially emit state before a later failure** → Preserve bounded page collection before Resource/Artifact emission and test a multi-page success path.
- **Graph's attachment size can differ from raw download bytes** → Omit the approximate value before download and let the managed store compute exact byte size from the stream.
- **Synthetic opaque ids can accidentally encode assumptions** → Model only the observed length bucket and canonical reserved-character behavior, not any real identifier content.

## Migration Plan

Not applicable. No persistent schema or released compatibility contract changes. Pre-alpha cached rows may be purged and re-searched if necessary.

## Open Questions

None.
