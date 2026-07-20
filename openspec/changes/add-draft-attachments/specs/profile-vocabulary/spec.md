## ADDED Requirements

### Requirement: Portable managed Draft attachment vocabulary
`communication.message@1` Draft create standalone and reply branches SHALL accept optional `attachments` as a non-empty ordered array of strict objects containing exactly one ctxindex Artifact `ref`. Callers MUST NOT supply paths, URLs, raw bytes, provider ids, filenames, media types, byte sizes, or other attachment overrides. Existing create inputs without attachments MUST remain valid.

Draft update branches MUST remain strict and MUST reject any attachment field. A complete Draft Resource produced by a Draft Action SHALL expose ordered `managedAttachmentRefs`, including an empty array when the Action proves that the Draft has no managed attachments. Managed attachment provenance MUST NOT be exposed as a Profile-derived Draft Artifact descriptor without a provider-derived downloadable identity.

#### Scenario: Standalone create accepts managed attachment Refs
- **WHEN** a caller supplies valid standalone Draft content and one or more strict `{ ref }` attachment entries
- **THEN** the portable create input validates and preserves their order

#### Scenario: Reply create accepts managed attachment Refs
- **WHEN** a caller supplies `replyToRef`, `bodyText`, and one or more strict `{ ref }` attachment entries
- **THEN** the input validates without permitting recipient, subject, attachment metadata, or provider overrides

#### Scenario: Update cannot mutate attachment collection
- **WHEN** a caller supplies any attachment field to standalone or reply Draft update
- **THEN** the complete input is schema-invalid before Action dispatch

#### Scenario: Draft result records managed provenance
- **WHEN** a Draft Action proves the ordered managed attachment set
- **THEN** the complete normalized Draft payload records those Refs without inventing provider Artifact descriptors
