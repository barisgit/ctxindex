# ctxindex design notes

Durable design truth is split by ownership:

- [`../CONTEXT.md`](../CONTEXT.md) — ubiquitous language and relationships.
- [`../openspec/specs/core-model/spec.md`](../openspec/specs/core-model/spec.md) and the other capability specs under `../openspec/specs/` — canonical normative behavior and public contracts.
- [`milestones/V1.md`](milestones/V1.md) — first-release scope and vertical slices.
- [`../openspec/specs/module-architecture/implementation.md`](../openspec/specs/module-architecture/implementation.md) and selective capability `implementation.md` sidecars — reference implementation doctrine.
- [`design/2026-07-13-context-access-layer.md`](design/2026-07-13-context-access-layer.md) — accepted decision log and cross-cutting design.
- [`../openspec/changes/v1-context-access-layer/`](../openspec/changes/v1-context-access-layer) — active capability specs and tasks.

Keep future durable decisions in the smallest appropriate owner rather than duplicating them here.
