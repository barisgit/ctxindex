# Design

The authoritative design for this change is the dated design document:

- **`docs/design/2026-07-13-context-access-layer.md`** — decision log D1–D19, ten-noun concept model and DAG, vocabulary rules, six-table storage model, relations/threading, ref grammar, capabilities/auth/routing, SDK and extension loading, target CLI surface, spec impact, deferred tier, open questions.

Supporting sources of truth (do not duplicate content here):

- `SPEC.md` — normative external behavior (already rewritten for the access layer: §3a–§3d, §10e–§10f).
- `CONTEXT.md` — domain language (Ref, Resource, Profile, Source, Extension, Artifact, Relation, Field Index).
- `IMPLEMENTATION.md` — reference implementation choices; superseded sections are mapped in its banner and get rewritten as slices land.
- `docs/design/architecture-explainer.md` / `.html` — narrative explainer of the same architecture.

## Resolved gate

- **D3 spike — passed (2026-07-13, Bun >=1.3.13):** a relocated compiled Bun executable dynamically imported an external TypeScript extension using the factory contract, a relative TypeScript import, and an extension-owned dependency. Bun 1.3.12 failed with exit 137; 1.3.13 and 1.3.14 passed, so the project is pinned to 1.3.14. Evidence: `scripts/spikes/d3-compiled-extension/`.

## Open questions blocking tasks

From design doc §13 — resolve before or during the first implementation slice:

1. Realms: keep or cut before the storage migration (flagged as possible ceremony).
2. `field_index` encoding for ranges/multi-valued fields + `--field` grammar.
3. Artifact retention shape and disk accounting; stored-payload migration on profile version bumps.
4. `ctx://` suffix encoding; `source_gone` vs `not_found`.
5. Revisit D7 (hybrid default) after dogfooding a partial Gmail sync.

## Slicing

First implementation slice ("V2 slice") agreed with the user: mail profiles + `google.mailbox` on six-table storage + `thread`/`artifact`/`export` verbs, plus a tenders extension as the external-extension proof. Tasks are generated per slice after the realms verdict; the D3 gate has passed.
