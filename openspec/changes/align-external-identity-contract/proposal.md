## Why

The core model currently requires a separate first-class external-reference concept and a `(source, kind, id)` uniqueness tuple that the accepted D13 storage model does not define. The established contract instead represents RFC message identity as the typed `communication.message.rfcMessageId` Profile field and uses generic natural-key Relations for zero-to-many cross-Source resolution. The normative language and readable projection need to match that accepted model without implying new storage or identity behavior.

## What Changes

- Remove the requirement for a separate first-class Resource external-reference store and its uniqueness tuple.
- Clarify that `communication.message.rfcMessageId` carries the normalized RFC Message-ID header value and is usable as a generic natural key.
- Clarify that natural-key Relations resolve to zero or more matching Resources across Sources while each Resource retains its Source-scoped Ref and identity.
- Keep cross-Source Resource collapse and any shared identity model deferred to a future explicit contract.
- Add focused static verification that rejects the obsolete separate-store and uniqueness claims.
- No runtime, schema, migration, SDK, Adapter, Ref, search, or Relation behavior changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-model`: Align Resource identity and natural-key Relation language with accepted D13/D14 storage and resolution decisions.
- `generic-storage`: Remove the contradictory `external_refs` storage claim and retain provider identifiers in Refs, envelope metadata, or typed Profile fields.

## Impact

This is a normative documentation clarification with matching updates to `SYSTEM.md` and repository verification. Runtime packages, public interfaces, persisted data, provider behavior, security boundaries, commands, historical documents, and migrations are unchanged.
