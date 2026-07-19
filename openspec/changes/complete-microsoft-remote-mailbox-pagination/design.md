## Context

The generic planner currently treats every query-less search as local execution, the Extension SDK remote query requires text and has no cursor, and the Microsoft mailbox Adapter caps one invocation at 50 normalized messages. Microsoft Graph requires clients to replay the complete validated `@odata.nextLink` URL for the next page, and the existing Adapter already proves immutable-id preference and next-link host/path validation. Microsoft also exposes `isRead` as a boolean message property and supports exact message filtering/search terms for read state.

The CLI/core boundary must remain provider-neutral, remote continuation must not change local offsets, and automated coverage must use only synthetic loopback Graph responses. The newer agent-orientation change also forbids restoring a static bundled command inventory.

## Goals / Non-Goals

**Goals:**

- Enumerate a remotely selected mailbox without invented text when a narrowing filter is present.
- Preserve exact `unread=true` and `unread=false` semantics through provider translation and Profile-backed post-verification.
- Resume one exact remote Source beyond 50 results with no page overlap, Draft leakage, or silently discarded eligible provider items.
- Keep local offset output stable and expose deterministic JSON metadata for remote continuation.
- Preserve immutable Graph ids and validated egress on every resumed request.

**Non-Goals:**

- Global pagination across multiple independently ranked remote Sources.
- Snapshot isolation against mailbox mutations between invocations.
- Local pagination changes, daemon/RPC integration, schema persistence, provider-specific CLI commands, message hydration, attachments, or Draft mutations.
- Live credential or provider access and static bundled workflow documentation.

## Decisions

1. `--continuation` is an opaque provider-neutral search input, but deterministic remote continuation is available only when `--remote` selects exactly one Source. Independent provider rankings cannot form one lossless global cursor without buffering discarded results. Exact single-Source continuation is the smallest contract that has no hidden gaps; broader remote searches remain valid but must be narrowed to one Source to resume.
2. Remote JSON uses `pagination: { limit, hasMore, continuation }`, while local JSON remains exactly `pagination: { offset, limit, hasMore }`. A non-null continuation is the only supported way to advance remote results. `--continuation` requires `--remote` plus one exact `--source`, and is mutually exclusive with `--offset` and `--local-only`.
3. The SDK carries an optional opaque continuation from Adapter result to the next Adapter query. Microsoft owns its cursor format and encodes a versioned validated Graph next link, the normalized query identity, requested limit, and previously seen immutable message ids. Binding the token to the unchanged query and requested limit prevents accidental cursor reuse while the Adapter independently caps each invocation at 50 results; bounded seen ids suppress cross-page duplicates without provider-specific core state.
4. Microsoft continues using message `$search` for text/sender/time predicates and adds exact `IsRead:false` for Profile `unread=true` and `IsRead:true` for `unread=false`. Core still verifies every normalized payload against the Profile extractor, so provider translation and shared semantics must agree. Draft messages remain excluded after parsing.
5. Each invocation returns at most 50 normalized messages and follows at most the existing bounded number of Graph pages. When a validated next link remains, the Adapter returns both the opaque cursor and an actionable `truncated` warning; the planner exposes `hasMore: true`. Every page, including cursor replay, explicitly sends `Prefer: IdType="ImmutableId"`.
6. Generated search help and `.agents/skills/repo-development/SKILL.md` teach the workflow. `skills/getting-started.md` remains concise orientation under the newer `agent-orientation-guidance` contract.

## Risks / Trade-offs

- [Continuation tokens grow as immutable ids are accumulated] -> Microsoft `$search` is provider-bounded, and token decoding enforces a fixed maximum seen-id count and schema before I/O.
- [Mailbox changes can shift a provider cursor between calls] -> The contract guarantees deterministic replay of the provider continuation, not a frozen mailbox snapshot; immutable ids and seen-id suppression prevent duplicate Refs.
- [A continuation cannot resume a multi-Source interleave] -> Fail continuation usage unless exactly one Source is selected, and keep the error actionable.
- [Provider KQL behavior can be broader than exact Profile semantics] -> Translate the boolean directly and retain provider-neutral Profile post-verification before caching or output.
- [A provider page could violate the requested page size] -> Reject an oversized page as a provider response error rather than silently drop eligible items.

## Migration Plan

Not applicable. This is a pre-alpha additive CLI/SDK contract with no persistent schema or deployed state. Existing local offset calls and queryful remote calls remain valid.

## Open Questions

None.
