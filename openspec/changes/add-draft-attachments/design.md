## Context

Draft create/update already validate strict standalone or reply inputs, perform one no-retry mutation, and materialize a complete Draft Resource. Managed Artifacts have Source-scoped descriptors and integrity-verified cached bytes, but Action adapters cannot currently resolve them. Gmail replaces the entire MIME message on Draft update. Microsoft Graph creates standalone and reply Drafts with attachment-bearing MIME in one request, but its message PATCH cannot update the attachment collection; attachment add/delete routes are separate mutations.

## Goals / Non-Goals

**Goals:**

- Attach one or more locally managed files to standalone or threaded-reply Draft creation on Gmail and Microsoft.
- Reject every unusable attachment before token resolution or provider mutation.
- Preserve one-shot, no-retry, stable-Ref, thread-identity, and no-send guarantees.
- Give updates one portable preservation-only attachment meaning.

**Non-Goals:**

- Adding, deleting, clearing, or replacing attachments on an existing Draft.
- Accepting arbitrary paths, raw bytes, filenames, media types, URLs, or provider attachment ids from Action callers.
- Downloading or hydrating missing attachment bytes during an Action.
- Sending mail, adding provider-specific Actions or CLI paths, or changing reply derivation.

## Decisions

1. Both create branches accept optional `attachments`, a non-empty ordered array of strict `{ ref }` objects. Callers cannot override filename, media type, size, or bytes. Update branches do not accept `attachments`; their existing strict shapes remain unchanged.

2. An attachment Ref must resolve to an existing Profile-derived descriptor and an integrity-verified cached Artifact in the exact selected Source. The resolved descriptor supplies filename and media type; the cache supplies exact bytes and byte size. Duplicate Refs, missing filenames, unsafe control characters, invalid media types, descriptor/cache mismatches, missing bytes, and cross-Source Refs fail before the provider fetch that resolves a token.

3. Draft payloads record `managedAttachmentRefs` as ordered local provenance. Create records an empty array when no attachment was selected and the exact input order otherwise. These Refs are not Draft Artifact descriptors and do not claim provider attachment identifiers; the field exists so a later full-message replacement can prove which managed bytes must be replayed.

4. Gmail renders one deterministic multipart MIME message and calls the existing create endpoint once. Microsoft uses one attachment-bearing MIME create request for both standalone and native reply Drafts. MIME filenames and media types are emitted only after strict validation and encoding; binary bytes use base64 with deterministic line folding and a collision-safe deterministic boundary.

5. Update is preservation-only. The Action schema rejects an attachment field, so callers cannot request a collection mutation. Microsoft PATCH omits attachments and therefore preserves them. Gmail must reconstruct the complete MIME message: when the stored Draft proves an empty managed set, it emits no attachment parts; when it records managed Refs, every Ref and byte must still resolve and is replayed; when provenance or bytes are unavailable, update fails locally. This avoids provider reads and silent attachment loss.

6. The Human checkpoint gates implementation of attachment-bearing update preservation because it deliberately tightens Gmail update eligibility and reflects an unavoidable cross-provider atomicity constraint. Create-path implementation and mocked verification can proceed independently.

## Risks / Trade-offs

- [A cached source Artifact is purged before a Gmail Draft update] -> Reject the update with download guidance before provider I/O; never silently drop the attachment.
- [Provider-generated attachment ids are not returned by Draft creation] -> Record only managed input provenance, not invented Draft Artifact descriptors; later provider retrieval remains responsible for provider-derived descriptors.
- [An exact get follows a Draft Action before provider retrieval] -> The complete local Action materialization exposes managed provenance but no invented provider-derived attachment descriptors. Native-provider acceptance confirmed the attachments persist; forcing a provider refresh for post-mutation descriptor introspection is separate retrieval behavior and remains out of scope.
- [A caller wants to replace attachments] -> Require a future explicitly non-atomic or provider-specific design; this change preserves the portable one-mutation contract.
- [MIME metadata can become a header-injection vector] -> Accept metadata only from validated descriptors, reject controls and invalid media types, and encode filenames instead of interpolating them raw.
- [Attachment-bearing MIME can exceed a provider limit] -> Apply a documented conservative portable bound before mutation and still normalize provider size errors without retry.

## Migration Plan

No schema migration is required. The payload provenance field and create input field are optional. Existing locally materialized Drafts without explicit attachment provenance may become ineligible for Gmail update when attachment preservation cannot be proven; this is a safe pre-alpha failure rather than a compatibility shim.

## Open Questions

- Human approval is required for the preservation-only update contract and its safe-failure behavior before attachment-bearing update implementation proceeds.
