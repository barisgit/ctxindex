# Design

The authoritative cross-capability design is:

- `docs/design/2026-07-13-context-access-layer.md` — decisions, concept model, storage, extension contract, operations, and open questions.
- `CONTEXT.md` — ubiquitous language and relationships.
- `SPEC.md` — normative external behavior.
- `IMPLEMENTATION.md` — reference code shape and runtime choices.
- `V1.md` — first-release scope and vertical slices.

This file records change-local sequencing rather than duplicating those documents.

## Resolved decisions

- This is V1. Prototype code and databases are disposable; there is no migration or compatibility work.
- Realms remain as user-defined operating contexts. Every Source has exactly one Realm; no filter means all, an explicit filter is exact, and no `global` Realm exists.
- Extensions bundle definitions; Profiles define semantics and Actions; Adapters implement provider operations.
- Typed provider Actions belong in ctxindex so reads and writes share Source selection, auth, identity, validation, and diagnostics.
- V1 Actions stop at reversible provider-persisted email Draft create/update. Sending and other domain mutations are deferred.
- Implementation is split into the smallest independently verifiable vertical slices listed in `V1.md`.
- No stored-payload migration machinery is built until a second real Profile version exists.
- D3 passed with Bun >=1.3.13; the project is pinned to 1.3.14 because 1.3.12 failed at external TypeScript import.

## Remaining design questions

Resolve in capability specs immediately before the owning slice:

1. Field-index scalar/array encoding, range representation, filter grammar, and aggregation opt-in.
2. Artifact retention classes, quota scope, eviction order, and status accounting.
3. Exact `ctx://` suffix encoding and unavailable-source error contract.
4. Hybrid search default after a concrete partial-Gmail-sync dogfood case.

## Slice order

1. definition factories and registries;
2. explicit-path Extension loading;
3. generic storage with a fake Profile;
4. minimal Gmail search/get;
5. thread Relations;
6. Artifacts/export;
7. provider Draft Actions;
8. local-directory Adapter;
9. external tenders Extension proof;
10. generated docs and end-to-end verification.

OpenSpec capability specs and tasks are created per slice. The apply agent proceeds in dependency order, runs each task's focused checks, must pass every explicit Slice gate before continuing, and finishes with the full project gate plus `openspec-verify-change`. It pauses only for a real blocker or artifact contradiction; archive remains explicit.
