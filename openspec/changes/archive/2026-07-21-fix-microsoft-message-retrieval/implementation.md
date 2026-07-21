## Capability Implementation Targets

- `microsoft-graph-adapters` → `openspec/specs/microsoft-graph-adapters/implementation.md`

## Module Ownership

`@ctxindex/official` remains the sole owner of Microsoft Graph request construction, provider response contracts, attachment normalization, and Graph diagnostic parsing. The Microsoft mailbox retrieval module owns message and bounded attachment-page orchestration; the shared Microsoft transport owns preference headers, response decoding, next-link validation, status mapping, and safe provider diagnostics. Provider-neutral core continues to own Ref dispatch, Resource/Artifact persistence, content-addressed caching, and CLI exit mapping, and MUST NOT gain Microsoft-specific branches.

Dependencies continue to point from Adapter operations through injected SDK contexts into core egress and persistence interfaces. The CLI remains a formatting/delegation shell.

## Interfaces and Data Flow

The existing Adapter interface remains stable:

```ts
export async function microsoftMailboxRetrieve(
  context: RetrieveContext,
): Promise<void>;
```

Retrieval parses the canonical same-Source Ref, requests the complete message with immutable-id and text-body preferences, and, only when attachments are declared, follows validated bounded attachment metadata pages with immutable-id preference. It accumulates normalized descriptors before emitting the complete Resource and Artifacts through `RetrieveContext`; provider DTOs do not cross the Adapter boundary.

Shared Graph response handling remains the single failure boundary for JSON operations and direct download responses. It may consume or clone a failed response exactly once to derive a bounded internal diagnostic envelope containing status, a validated Graph code, a fixed safe wording classification, and request-identifier presence. Status remains authoritative for `CtxindexSyncError` classification. The rendered error message may include only the safe envelope; raw bodies, arbitrary provider wording, and identifier values are discarded.

Attachment metadata requests retain only fields needed by the existing Graph attachment schema while relying on Graph response annotations for provider type. They exclude both the invalid annotation selection and Exchange's approximate `size` field. Artifact descriptors omit `byteSize`; after download, the managed store derives exact size from streamed bytes. Continuation URLs pass through the existing exact-origin/path validator before injected fetch is called.

## Storage and State

No new durable state is introduced. Adapter retrieval collects the complete bounded result in memory and emits only provider-neutral values. Core remains responsible for ad-hoc materialization, Artifact descriptor persistence, exact-byte content-addressed storage, and cache reuse. Operator replay evidence stays ephemeral and ignored under `.operator-artifacts/`.

## Security and Compatibility

All provider I/O continues through the injected fetch and the declared Microsoft Graph host allowlist; no alternate client or redirect behavior is added. Authorization, raw provider payloads, message data, Refs, Graph ids, and request-identifier values MUST NOT enter diagnostics or fixtures. Synthetic ids preserve only the observed encoding characteristics.

Existing stable error codes and CLI exit meanings remain unchanged. The repository is pre-alpha, so no migration, deprecated alias, or compatibility path is added.

## Verification

- Microsoft mailbox retrieval tests enforce the exact message/attachment request sequence, immutable-id preferences, canonical opaque-id encoding, Graph-compatible metadata selection, approximate-size omission, bounded pagination, and complete emission.
- Shared Microsoft transport tests enforce status mapping, retry metadata, structured Graph-code parsing, fixed safe wording, identifier redaction, malformed-body handling, and absence of private literals.
- The loopback Graph server rejects the formerly accepted annotation selection and records only redacted request structure.
- The compiled Outlook workflow proves remote search to exact get, paged Artifact listing, exact-byte download, and cache reuse through generic CLI commands.
- Network-egress verification, repository CI, strict OpenSpec validation, and change verification remain required gates.

## Promotion Notes

Before archive, merge into `openspec/specs/microsoft-graph-adapters/implementation.md`:

- Shared Microsoft transport owns bounded Graph failure parsing and emits only validated codes, fixed safe wording, and redacted request-identifier presence while preserving status-based normalized classification.
- Microsoft mailbox retrieval accumulates complete bounded attachment metadata using Graph-compatible projections and validated continuation links before emitting provider-neutral Resources and Artifacts.
- Add transport diagnostic/redaction and compiled search/get/paged-artifact/cache replay coverage to the capability's verification doctrine.
