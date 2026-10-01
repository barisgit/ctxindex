## Context

The Extension SDK redesign replaced a host-supplied factory API with ordinary runtime imports from the private SDK workspace and closed Provider authentication to `oauth2 | none`. The subsequent documentation-tree change added one passive Extension-root sidecar and a transport-neutral core projection while deliberately deferring CLI, agent, and browser consumers. Runtime, tests, CONTEXT, and most of SYSTEM reflect that state, but the accepted design record and two canonical requirements retain the earlier future-facing language. Current codemaps also contain narrower package-boundary and traversal inaccuracies.

## Goals / Non-Goals

**Goals:**

- Make current design, normative contracts, implementation doctrine, SYSTEM, and codemaps describe the same implemented Extension and documentation model.
- Preserve the distinction between runtime SDK imports, host-provided operation contexts, passive Extension documentation, and bundled agent workflow skills.
- Correct only confirmed documentation drift through the formal capability delta required for canonical spec edits.

**Non-Goals:**

- Change runtime behavior, schemas, command registration, package metadata, release automation, or persisted state.
- Add a CLI, web, or agent consumer for Extension documentation.
- Add API-key, basic, custom-secret-bucket, or other Provider authentication forms.
- Modify or archive existing OpenSpec changes, including `ship-installable-npm-cli`.

## Decisions

1. Treat the current runtime and tests as authoritative and amend the accepted D2, D3, D5, and D19 record rather than preserving contradictory pre-redesign wording without a supersession marker.
2. Keep passive documentation attached only to an Extension root and explicitly outside Provider, Profile, Adapter, and runtime definition identity. The core projection is implemented; presentation consumers remain deferred.
3. Keep bundled skills separate from Extension documentation. Skills remain release-versioned workflow guidance; loaded registry schemas remain authoritative for interface facts; Extension documentation is not exposed by the current CLI or agent surface.
4. Correct SYSTEM and affected codemaps directly because they are non-normative projections. Correct canonical spec wording only through this change's `core-model` and `cli-surface` deltas.

## Risks / Trade-offs

- [A documentation-only delta can look like new product behavior] → State repeatedly that runtime behavior is unchanged and copy complete existing requirements under `MODIFIED Requirements`.
- [The accepted design mixes dated experiment evidence with current doctrine] → Preserve the historical Bun result while distinguishing the original spike from the retained runtime-SDK regression.
- [Codemap edits could expand into broad prose cleanup] → Limit changes to the confirmed package, registry traversal, and path-predicate statements.

## Migration Plan

Not applicable. No deployed or persisted state changes.

## Open Questions

None.
