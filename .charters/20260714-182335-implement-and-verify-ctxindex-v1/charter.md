# Charter: Implement and verify ctxindex V1

## Objective

Implement and verify ctxindex V1 as the local personal-context gateway defined by `v1-context-access-layer`: typed definitions, trusted Extension loading, fresh generic storage, exact Realms, Gmail discovery/retrieval, threads, Artifacts/exports, reversible provider email Draft Actions, local-directory support, an external tenders proof, generated docs, and complete validation.

## References

- `openspec/changes/v1-context-access-layer/`
- `CONTEXT.md`
- `SPEC.md`
- `V1.md`
- `IMPLEMENTATION.md`
- `docs/design/2026-07-13-context-access-layer.md`

## Scope

Deliver the active change in dependency order on fresh disposable V1 state. Preserve no prototype schema, data, CLI compatibility, aliases, or architecture. Provider mutations are limited to reversible Gmail Draft creation and update; sending and all other deferred capabilities remain unavailable. Human checkpoints require explicit user confirmation and redacted evidence.

## Criteria

### C1. Public definitions and registries drive the runtime
External authors can define versioned Profiles, Adapters, and Extensions through the public SDK, while validated registries atomically reject invalid, duplicate, or inconsistent definitions and derive the available vocabulary and capabilities without runtime-core imports.
Status: pass — evidence: `work/slice-1-gate.txt` (typecheck, lint, 181 passing tests, and compiled-extension regression passed)

### C2. Compiled ctxindex loads trusted external TypeScript Extensions
A relocated compiled binary loads explicitly configured trusted TypeScript Extensions and their dependencies through the public seam, supplies only declared capability contexts, rejects an invalid Extension as a unit, and preserves existing Resources when an Extension disappears.
Depends: C1
Status: pass — evidence: `work/slice-2-gate.txt` (explicit-path loading, atomic rejection, D3 relocation, Source preservation/recovery, typecheck, lint, and 190 tests passed)

### C3. Fresh generic storage enforces exact Realm and Source semantics
A database created from empty contains only the generic V1 model; Profile-derived Resources, fields, chunks, Relations, Artifacts, and sync bookkeeping update transactionally with stable Source-scoped Refs, correct synced/ad-hoc lifecycle, explicit user-created Realms, exact filters, and no seeded `global` Realm.
Depends: C1
Status: pending

### C4. Gmail discovery and retrieval use the generic contract
An explicitly Realm-bound Gmail Source can search remotely, participate in local and mixed routing with deterministic warnings and explain metadata, and retrieve/cache complete message Resources by stable Ref using only its linked Grant.
Depends: C2, C3
Status: pending

### C5. Threads traverse generic Relations
Conversation membership and bidirectional parent Relations assemble complete reply trees despite out-of-order arrival, with flat date ordering when parent edges are absent and cross-Source natural keys joining without collapsing Resource identity.
Depends: C3, C4
Status: pending

### C6. Artifacts and exports are managed and observable
Attachment bytes download lazily into a content-addressed deduplicating store, cached access avoids provider I/O, output copies preserve managed bytes, retention and explicit purge follow the accepted policy, disk accounting is accurate, and Resources export as JSON plus Profile-declared formats.
Depends: C3, C4
Status: pending

### C7. Gmail Draft Actions are typed, reversible, and cannot send
Registry-derived Action discovery and execution validate complete input before provider I/O, require an explicit Source and linked Grant, and create/update only the addressed provider Draft as a stable message Resource; no send or irreversible Action exists and composing text alone creates no state.
Depends: C1, C3, C4
Status: pending

### C8. Local directories use the same generic Resource path
A sandboxed local-directory Source syncs files with limits, ignores, and non-fatal skip reporting, then exposes them through the same generic search, get, Ref, and result-envelope behavior as Gmail without a domain-specific core path.
Depends: C1, C3
Status: pending

### C9. An external tenders Extension proves the public seam
A tenders Extension outside bundled packages imports only public SDK contracts, loads by explicit path through the relocated compiled binary, participates in generic operations, and leaves its Source unavailable but materialized Resources searchable after removal.
Depends: C2, C3
Status: pending

### C10. User and agent interfaces derive from loaded registries
CLI help, `ctxindex describe`, Action affordances, supported kinds, aliases, fields, formats, Source configuration, and agent reference material are generated from loaded definitions with no parallel hand-maintained vocabulary and no required interactive prompts.
Depends: C1, C7, C8, C9
Status: pending

### C11. Complete V1 behavior is verified end to end
All focused checks, mandatory Slice gates, final automated commands, sandboxed runtime workflow, strict OpenSpec validation, independent change verification, and both required human-assisted Gmail checks pass with meaningful redacted artifacts and SPEC §12 exit behavior; the change remains unarchived for review.
Depends: C1, C2, C3, C4, C5, C6, C7, C8, C9, C10
Status: pending
