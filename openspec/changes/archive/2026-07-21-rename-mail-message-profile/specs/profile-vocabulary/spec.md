## MODIFIED Requirements

### Requirement: Profiles own pure domain vocabulary
For V1, Profile definitions SHALL provide schema-backed domain vocabulary, including the slots needed for search extraction, typed fields, Relations, Artifact descriptors, exports, Actions, aliases, and documentation. The bundled vocabulary SHALL include strict provider-neutral `mail.message@1`, `calendar.event@1`, and `file@1` Profiles. `mail.message@1` SHALL retain email-specific RFC headers and identifiers, recipient fields, subject, MIME/EML export, attachment descriptors, typed search fields, generic `conversation` and `parent` Relations, and reversible Draft Actions. Core MUST NOT add provider- or domain-specific vocabulary paths, and ordinary vocabulary functions MUST remain pure over validated payloads.

#### Scenario: Email Profile drives two providers
- **WHEN** Google and Microsoft mailbox Adapters emit valid `mail.message@1` payloads
- **THEN** identical Profile-owned fields, chunks, Relations, Artifacts, exports, Actions, aliases, and documentation drive generic storage, search, retrieval, threading, export, and Action discovery for both

#### Scenario: Calendar Profile drives two providers
- **WHEN** Google and Microsoft calendar Adapters emit valid `calendar.event@1` payloads
- **THEN** identical Profile-owned fields, chunks, Relations, aliases, and documentation drive generic storage/search/get for both

#### Scenario: Unknown Profile version degrades safely
- **WHEN** an Adapter emits a Resource whose Profile id or version is not loaded
- **THEN** core accepts and indexes the envelope, emits a warning, and does not fail the operation

### Requirement: Complete Profile vocabulary contract
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A profile declares, at minimum: an id, an integer version, and a payload schema. It MAY declare vocabulary slots:

- **search mapping** — pure extractors for title, occurred-at, and FTS chunks;
- **fields** — TYPED declarations (`type` + pure extractor) that populate the generic field index and define valid `--field` filters and aggregations;
- **relations** — pure extractors producing edges to refs or natural keys ([Resource identity, deletion, and Relations](../../../core-model/spec.md));
- **artifacts** — pure extractor producing artifact descriptors (bytes fetched lazily);
- **exports** — a map of format name to media type + render function;
- **actions** — typed provider-mutation contracts (stable id, input schema, output contract, effect classification, docs, and examples) whose I/O implementations belong to adapters;
- **docs** — human summaries, kind aliases, and examples, from which agent-facing documentation is derived.

Vocabulary rules (normative):

1. Vocabulary functions MUST be pure over the validated payload; no I/O. The one exception is export render functions, which MAY receive core-resolved declared dependencies (e.g. related resources by relation type). Action declarations are pure contracts; their provider I/O is never a profile vocabulary function.
2. Vocabulary slots are versioned. An implementation encountering an unknown slot MUST ignore it with a diagnostic and continue.
3. When an adapter emits a payload for an unknown profile id or version, core MUST accept the resource at envelope level, index what the envelope carries, and surface a warning (degraded acceptance). Sync MUST NOT fail on unknown profiles.
4. The V1 bundled canonical Profiles MUST be `mail.message@1`, `calendar.event@1`, and `file@1`. Bundled and extension-defined Profiles MUST be expressible through the same public Profile API; V1 MUST NOT require an `artifact` Profile because Artifacts are represented by Profile-extracted descriptors.
5. The legacy `communication.message` Profile and `communication.message.draft.*` Actions MUST NOT be loaded or exposed as aliases.

#### Scenario: A Profile supplies domain semantics through pure versioned vocabulary
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: An Extension defines another domain
- **WHEN** a trusted external Extension supplies a valid Profile outside the V1 bundled inventory
- **THEN** the system activates it through the same public Profile API without requiring that domain to be predeclared as bundled vocabulary

#### Scenario: Legacy message identity is absent
- **WHEN** a caller inspects the loaded canonical registry and public profile exports
- **THEN** `mail.message@1` and its `mail.message.draft.*` Actions are present while no `communication.message` Profile, Action, alias, or compatibility export is present
