## Why

A live Microsoft mailbox Source emits stable immutable message Refs, and the exact message request succeeds, but `get` still exits with the normalized provider-failure code when a message has attachments. The attachment metadata request sends an OData selection that Microsoft Graph rejects with `BadRequest`, so hydration cannot complete and the generic Artifact workflow remains unavailable. Existing mocks accept the invalid request and Graph failures discard the diagnostic fields needed to distinguish this failure safely.

## What Changes

- Make Microsoft mailbox attachment metadata hydration use a Graph-compatible request across every bounded attachment page.
- Guarantee that a Ref emitted by remote Microsoft mailbox search completes exact retrieval and exposes file attachment descriptors through the provider-neutral Artifact interface.
- Stop treating Exchange's approximate attachment `size` metadata as the exact raw byte count; let the managed store record the exact streamed size after download.
- Preserve the existing normalized error taxonomy while surfacing sanitized Microsoft Graph error code, safe message wording, and redacted request-identifier presence suitable for operator diagnosis.
- Add wholly synthetic regression and CLI replay coverage for the observed immutable-ID encoding and rejected attachment-query shape, including paged descriptors, exact-byte download, and cache reuse.
- No breaking changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `microsoft-graph-adapters`: Strengthen mailbox retrieval, attachment paging, and redacted Graph failure diagnostics so live-provider behavior matches the existing provider-neutral retrieval and Artifact contracts.

## Impact

- Microsoft adapter transport and mailbox retrieval behavior in `@ctxindex/official`.
- Synthetic Microsoft Graph mocks and compiled CLI end-to-end coverage.
- Existing CLI exit meanings remain unchanged; no provider mutation or additional egress path is introduced.
- No schema migration or compatibility alias is required in this pre-alpha repository.
