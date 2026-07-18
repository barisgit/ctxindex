## Context

The retrieval-and-artifacts capability already distinguishes Profile-derived descriptors, lazy provider download, managed cached bytes, and export rendering. The timeless core model predates that distinction and uses “Artifact” for both the descriptor and bytes in storage. `CONTEXT.md` and parts of `SYSTEM.md` repeat the older shorthand. This change aligns the language without changing behavior.

## Goals / Non-Goals

**Goals:**

- Give Artifact one portable domain meaning: a Source-scoped descriptor derived from a Resource Profile.
- Name cached bytes and cache metadata separately from the descriptor.
- Make purge, export, and optional raw-payload boundaries explicit.
- Guard the clarified language with focused static verification.

**Non-Goals:**

- Changing runtime, schema, CLI, provider, cache, purge, or export behavior.
- Adding new Artifact kinds, retention policies, raw-record storage, or export caching.
- Redesigning the existing retrieval-and-artifacts capability.

## Decisions

1. `core-model` will adopt the descriptor-first definition already exercised by retrieval and download. This preserves Artifact identity before bytes are cached and explains why purge does not remove discoverability.
2. “Managed content-addressed cache” will name the byte-storage layer. The term Artifact will not stand in for a cache row or CAS object.
3. Profile exports remain a sibling representation path. They are rendered and streamed; treating them as cached Artifacts would require a future explicit contract.
4. Optional raw provider payload retention remains generic support data and will not be described as Artifact storage.
5. Static verification will assert the required descriptor/cache/export distinctions and reject the known contradictory phrases in current-facing documentation.

## Risks / Trade-offs

- [Risk] A narrow terminology correction could accidentally imply changed runtime behavior. → State the no-behavior-change boundary in every artifact and test only documentation claims.
- [Risk] Repeating the clarification across projections can create another source of truth. → Keep normative behavior in `core-model`; keep `CONTEXT.md` terminological and `SYSTEM.md` explicitly non-normative.

## Migration Plan

Not applicable. No persistent or deployed state changes.

## Open Questions

None.
