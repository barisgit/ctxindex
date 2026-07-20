## Capability Implementation Targets

- `profile-vocabulary` → `openspec/specs/profile-vocabulary/implementation.md`
- `provider-actions` → `openspec/specs/provider-actions/implementation.md`
- `retrieval-and-artifacts` → `openspec/specs/retrieval-and-artifacts/implementation.md`
- `microsoft-graph-adapters` → `openspec/specs/microsoft-graph-adapters/implementation.md`

## Module Ownership

`@ctxindex/profiles` owns the strict portable `{ ref }` attachment input schema and optional Draft payload provenance. `@ctxindex/extension-sdk` owns the provider-neutral resolved Action Artifact shape and resolver callback. `@ctxindex/core` owns current-descriptor lookup, Source scoping, cache integrity verification, byte reads, and resolver construction. `@ctxindex/adapters` owns safe MIME validation/rendering, provider request construction, provider response attestation, and Draft-specific preservation decisions. The CLI remains a registry-derived thin Action consumer.

## Interfaces and Data Flow

The durable public Action seam extends `ActionContext<TInput>` with:

```ts
export interface ActionArtifact {
  readonly ref: string
  readonly originRef: string
  readonly filename: string
  readonly mediaType: string
  readonly byteSize: number
  readonly bytes: Uint8Array
}

export interface ActionContext<TInput = unknown> extends ProviderContext {
  readonly input: TInput
  readonly signal: AbortSignal
  readonly resolveResource: (ref: string) => ActionResource | null
  readonly resolveArtifact: (
    ref: string,
    maxByteSize?: number,
  ) => Promise<ActionArtifact | null>
}
```

`ArtifactStore` adds a verified byte-read operation that returns immutable metadata plus a copied `Uint8Array`; it never exposes a local CAS path through the SDK. The optional maximum read size is checked against stored metadata before filesystem verification or byte allocation. `ArtifactService` reuses the same current Profile descriptor extraction used by list/download, identifies the exact owning Resource, verifies Source ownership and current descriptor membership, enforces the caller's remaining byte budget against descriptor and cache metadata, reads the cached Artifact, compares effective descriptor metadata with the cache row, and returns an Action-safe value. Missing cache content returns `null`; invalid descriptors, integrity failures, Source mismatches, and over-budget reads retain typed errors.

Core constructs `resolveResource` and `resolveArtifact` before provider context construction. Provider token resolution remains lazy inside `fetch`, so adapters await and validate every requested Artifact before their first fetch. The create input schemas add `attachments?: readonly { readonly ref: string }[]` to both strict branches. Draft payloads add `managedAttachmentRefs?: readonly string[]` so new Action results can distinguish a proven empty set from unknown legacy state.

A shared adapter-internal MIME renderer accepts validated envelope headers, normalized text, and ordered resolved Artifacts. Resolution passes the decreasing portable byte allowance to core so an oversized cache entry fails before its bytes are allocated. The renderer applies fixed CRLF line endings, base64 attachment encoding and folding, encoded filenames, validated media types, and a deterministic collision-free multipart boundary. Gmail base64url-encodes the rendered MIME; Microsoft base64-encodes it after normalizing standalone and reply recipients through the same Graph recipient seam, including quoting comma-containing display names. Existing provider-specific response parsers remain responsible for stable Draft identities and normalized message fields.

## Storage and State

The existing Artifact CAS and `artifacts` table remain the sole owners of bytes and cache metadata. Attachment create performs no new local write before provider mutation. Successful Action materialization stores only ordered managed input Refs in the Draft payload; it neither copies CAS objects nor invents provider attachment descriptors. Purge may make those Refs temporarily unusable for later Gmail preservation, in which case the Action fails safely until the original descriptors are downloaded again.

## Security and Compatibility

The resolver rejects cross-Source Refs before descriptor or cache access. Adapters accept no filesystem path, URL, raw bytes, or metadata from Action JSON. Filenames must be non-empty bounded Unicode without controls, path separators, `.`/`..`, or header delimiters; media types must match a bounded ASCII type/subtype grammar. Duplicate Refs, too many attachments, or an aggregate byte size above the shared portable in-memory bound fail locally. Exact constants live beside the portable schema/renderer and are not configurable in pre-alpha.

No new provider host, scope, retry, send route, or irreversible effect is introduced. Existing create inputs remain source-compatible because `attachments` is optional. Update schemas remain unchanged. New Draft results add only optional payload provenance; no migration or deprecated alias is added.

## Verification

Profile tests cover strict branch acceptance, metadata override rejection, duplicate/empty arrays, update rejection, and payload provenance. Core tests cover current-descriptor lookup, same-Source enforcement, unavailable/purged cache, integrity and metadata mismatch, copied bytes, resolver availability, lazy authentication, and zero provider I/O. Shared MIME tests cover exact CRLF output, binary base64, Unicode filename encoding, deterministic boundaries, control/media-type rejection, duplicates, and portable bounds.

Gmail and Microsoft focused tests cover standalone and reply create with exact bytes, exact one-request MIME, stable Draft Refs, thread identity, managed provenance, malformed zero-fetch behavior, no retry, and no send route. Mocked compiled CLI tests cover generated schemas, cached Artifact input, create materialization, and recorded provider calls. Update preservation tests remain behind the explicit Human design checkpoint. Final gates are affected package suites, architecture checks, compiled Extension/Draft e2e, `bun run ci`, strict OpenSpec validation, change verification, `git diff --check`, and independent review.

## Promotion Notes

- Merge the strict managed attachment create schema, `managedAttachmentRefs` payload member, and compatibility notes into `openspec/specs/profile-vocabulary/implementation.md`.
- Merge `ActionArtifact`, `resolveArtifact`, pre-fetch resolution order, and provider-neutral ownership into `openspec/specs/provider-actions/implementation.md`.
- Merge verified cached-byte reads, current descriptor revalidation, Source scoping, and purge behavior into `openspec/specs/retrieval-and-artifacts/implementation.md`.
- Merge single-request MIME create for standalone/reply Drafts and attachment-preserving PATCH doctrine into `openspec/specs/microsoft-graph-adapters/implementation.md`.
