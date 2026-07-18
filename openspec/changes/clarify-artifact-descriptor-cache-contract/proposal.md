## Why

The core model currently describes an Artifact as bytes already held in the managed store and includes raw records and rendered exports in that store. The implemented retrieval contract instead distinguishes a Profile-derived Artifact descriptor from provider bytes that enter the managed content-addressed cache only when downloaded. The canonical language and readable projections need one consistent model so callers can predict listing, download, purge, and export behavior.

## What Changes

- Define an Artifact as a Source-scoped, Profile-derived descriptor for downloadable bytes associated with a Resource.
- Clarify that provider bytes enter the managed content-addressed cache lazily on download.
- Clarify that Artifact purge removes cached bytes and cache metadata while preserving the owning Resource and descriptor.
- Keep Profile exports separate: they are rendered and streamed, not cached as Artifacts without a future explicit contract.
- Keep optional raw provider payload retention separate from the Artifact contract.
- Add focused static verification that prevents the contradictory terminology from returning.
- No runtime, schema, CLI, provider, or security behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-model`: Align the timeless Artifact definition and product-scope summary with the established retrieval-and-artifacts lifecycle.

## Impact

This is a normative documentation clarification with matching updates to `CONTEXT.md`, `SYSTEM.md`, and repository verification. Runtime packages, public interfaces, persisted data, provider behavior, network boundaries, and command behavior are unchanged.
