# ctxindex

ctxindex is a local personal-context gateway for agents. It provides one deterministic interface to discover, retrieve, and materialize context across mail, files, calendars, tasks, and extension-defined domains, then perform typed provider Actions through the same configured Source and authentication. Indexing is a strategy for fast local discovery, not the product boundary.

```text
Agent ───── CLI ────> ctxindex ──> Sources ──> providers/files
                         │
                         ├── Realms: personal / company / university
                         ├── Profiles: portable domain semantics
                         ├── Adapters: provider operations
                         └── Resources / Refs / Relations / Artifacts
```

V1 is under active development. The code currently in the repository is disposable prototype scaffolding; it is not an earlier released version and receives no schema or CLI compatibility treatment. The target is tracked in `openspec/changes/v1-context-access-layer/`.

## Development

```sh
bun install
bun cli --help
# equivalently:
bun run cli --help
```

There is no `bun link` development path. Both commands dispatch to `apps/cli/bin/ctxindex.mjs`.

## Documentation map

| Document | Owns |
|---|---|
| `CONTEXT.md` | Ubiquitous language and domain relationships |
| `SPEC.md` | Timeless normative behavior and Adapter/Extension contracts |
| `V1.md` | First-release scope, deferrals, and implementation slices |
| `IMPLEMENTATION.md` | Reference implementation choices |
| `docs/design/2026-07-13-context-access-layer.md` | Decisions D1–D22 and cross-cutting rationale |
| `docs/design/architecture-explainer.md` / `.html` | Narrative architecture explainer |
| `openspec/changes/v1-context-access-layer/` | Active capability specs and tasks |
| `docs/AGENT-HOWTOS.md` | Recipes for driving the current prototype while V1 is built |
| `skills/` | Agent-facing usage docs shipped with the CLI |
