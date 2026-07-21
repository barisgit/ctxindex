## MODIFIED Requirements

### Requirement: Complete Profile vocabulary contract
The system MUST preserve the following contract without changing the normative force of its MUST, SHOULD, and MAY clauses.

A profile declares, at minimum: an id, an integer version, and a payload schema. It MAY declare vocabulary slots:

- **search mapping** — pure extractors for title, occurred-at, and FTS chunks;
- **fields** — TYPED declarations (`type` + pure extractor) that populate the generic field index and define valid `--field` filters and aggregations;
- **relations** — pure extractors producing edges to refs or natural keys ([Resource identity, deletion, and Relations](../../../../../openspec/specs/core-model/spec.md));
- **artifacts** — pure extractor producing artifact descriptors (bytes fetched lazily);
- **exports** — a map of format name to media type + render function;
- **actions** — typed provider-mutation contracts (stable id, input schema, output contract, effect classification, docs, and examples) whose I/O implementations belong to adapters;
- **docs** — human summaries, kind aliases, and examples, from which agent-facing documentation is derived.

Vocabulary rules (normative):

1. Vocabulary functions MUST be pure over the validated payload; no I/O. The one exception is export render functions, which MAY receive core-resolved declared dependencies (e.g. related resources by relation type). Action declarations are pure contracts; their provider I/O is never a profile vocabulary function.
2. Vocabulary slots are versioned. An implementation encountering an unknown slot MUST ignore it with a diagnostic and continue.
3. When an adapter emits a payload for an unknown profile id or version, core MUST accept the resource at envelope level, index what the envelope carries, and surface a warning (degraded acceptance). Sync MUST NOT fail on unknown profiles.
4. The V1 bundled canonical Profiles MUST be `mail.message@1`, `calendar.event@1`, and `file@1`. Bundled and extension-defined Profiles MUST be expressible through the same public Profile API; V1 MUST NOT require an `artifact` Profile because Artifacts are represented by Profile-extracted descriptors.

#### Scenario: A Profile supplies domain semantics through pure versioned vocabulary
- **WHEN** a conforming implementation exercises this contract
- **THEN** it satisfies every applicable MUST and MUST NOT clause and treats SHOULD, SHOULD NOT, and MAY clauses according to their normative meanings

#### Scenario: An Extension defines another domain
- **WHEN** a trusted external Extension supplies a valid Profile outside the V1 bundled inventory
- **THEN** the system activates it through the same public Profile API without requiring that domain to be predeclared as bundled vocabulary
