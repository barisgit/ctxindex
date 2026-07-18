## Context

Accepted storage decision D13 defines Resources, typed field-index rows, chunks, Relations with cached resolutions, Artifacts, and configuration/sync bookkeeping; it defines no separate external-reference table. D14 resolves Relation natural keys through the typed field index and permits zero-to-many matches across Sources. The older core-model prose independently introduced first-class external references and a `(source, external kind, external id)` uniqueness contract, creating a storage implication that neither accepted decision nor the runtime contract owns.

## Goals / Non-Goals

**Goals:**

- Make Source-scoped Resource identity and generic natural-key Relation resolution explicit.
- Place RFC message identity in the `communication.message` Profile vocabulary as the typed `rfcMessageId` field.
- Remove the implied separate external-reference persistence contract.
- Keep cross-Source copies distinct while allowing zero-to-many Relation resolution.

**Non-Goals:**

- Changing runtime, schema, migration, SDK, Adapter, Ref, search, or Relation behavior.
- Adding cross-Source deduplication, canonical identity, merge policy, or a new store.
- Editing accepted design decisions or historical documents.

## Decisions

1. A Resource remains identified by its Source-scoped Ref. Provider identifiers may be Profile fields and natural keys, but do not form a second generic Resource identity layer.
2. `communication.message.rfcMessageId` carries the normalized RFC Message-ID header value. Relations may target that exact value through the existing `(field, value)` natural-key contract.
3. Natural-key resolution is global across Sources and returns zero-to-many Resource matches. Multiple matches remain distinct Resources with distinct Source-scoped Refs.
4. Cross-Source collapse and any shared identity model remain deferred. Introducing either requires a future explicit capability and storage contract rather than anticipatory requirements now.
5. Static verification will reject the obsolete first-class external-reference and uniqueness-tuple language in current-facing documentation.

## Risks / Trade-offs

- [Risk] Removing the separate-store language could be misread as removing RFC message identity. → Name the typed Profile field and natural-key Relation path explicitly.
- [Risk] “Global resolution” could be mistaken for deduplication. → State that resolution is zero-to-many and preserves every Source-scoped Resource.
- [Risk] A documentation correction could imply a migration. → State that no schema exists for the removed claim and no runtime or migration work occurs.

## Migration Plan

Not applicable. No persistent or deployed state changes.

## Open Questions

None.
