## Capability Implementation Targets

- `core-model` → `openspec/specs/core-model/implementation.md` (no canonical sidecar currently exists)

## Module Ownership

No durable implementation doctrine changes. Profiles continue to own typed domain fields such as `mail.message.rfcMessageId`; provider-neutral core continues to own Source-scoped Resource identity, the generic field index, and Relation resolution.

## Interfaces and Data Flow

Existing Profile field declarations, Resource Refs, natural-key Relation targets, and zero-to-many resolution interfaces remain unchanged. This change only removes a documentation-only external-reference abstraction that has no accepted interface or runtime owner.

## Storage and State

No storage or state changes. D13 remains the complete accepted generic storage model, and D14 continues to resolve natural keys through typed field-index values with cached zero-to-many Relation matches.

## Security and Compatibility

No trust, egress, secret, compatibility, migration, provider, or Realm-boundary changes. Cross-Source resolution remains global because Realms are not security boundaries, while Resource identity remains Source-scoped.

## Verification

A focused static repository test checks the canonical core model, generic-storage contract, and `SYSTEM.md` for the normalized typed-field, zero-to-many resolution, distinct-Resource, and deferral contract while rejecting the obsolete separate-store and uniqueness-tuple claims. Existing strict OpenSpec validation and full CI remain the cross-cutting gates.

## Promotion Notes

No implementation doctrine must be promoted. Do not create `openspec/specs/core-model/implementation.md`; the change aligns normative and projected documentation only.
