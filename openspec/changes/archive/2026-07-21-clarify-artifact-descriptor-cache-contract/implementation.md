## Capability Implementation Targets

- `core-model` → `openspec/specs/core-model/implementation.md` (no canonical sidecar currently exists)
- `generic-storage` → `openspec/specs/generic-storage/implementation.md`

## Module Ownership

No durable implementation doctrine changes. Profiles continue to derive Artifact descriptors, Adapters continue to stream provider bytes through the download operation, and provider-neutral core continues to own the managed cache and purge lifecycle.

## Interfaces and Data Flow

Existing `ArtifactDescriptor`, `DownloadContext`, `ArtifactService`, `ArtifactStore`, and export interfaces remain unchanged. This change only gives their established descriptor → lazy download → cached bytes flow consistent canonical terminology.

## Storage and State

No storage or state changes. Resource payloads carry the fields from which Profiles derive descriptors on demand; downloaded bytes and their metadata remain purgeable cache state in the existing managed CAS.

## Security and Compatibility

No trust, egress, secret, compatibility, migration, or provider changes. The clarification does not expand which bytes may be fetched or persisted.

## Verification

A focused static repository test checks current-facing terminology across the canonical core model, canonical generic-storage behavior, generic-storage implementation doctrine, `CONTEXT.md`, and `SYSTEM.md`. Existing strict OpenSpec validation and full CI remain the cross-cutting gates.

## Promotion Notes

Promote the focused generic-storage doctrine clarification to `openspec/specs/generic-storage/implementation.md`. Do not create `openspec/specs/core-model/implementation.md`; no separate core-model implementation doctrine is needed.
