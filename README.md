# ctxindex

ctxindex is the source-of-truth interface through which agents discover, retrieve, and locally materialize personal context — mail, calendars, files, tasks, and arbitrary user-defined sources. Indexing (sync into a local SQLite-backed store) is one implementation strategy, not the product definition: sources can be searched ad hoc, retrieved on demand, and materialized locally (threads, attachments, exports) through one deterministic CLI.

Built with Bun/TypeScript as a monorepo (`apps/cli`, `packages/core`, `packages/adapters`).

> The shipped v1 CLI still reflects the original "local indexing" scope. The
> access-layer architecture is specified in `SPEC.md` and
> `docs/design/2026-07-13-context-access-layer.md`, and tracked as the active
> OpenSpec change `openspec/changes/v2-context-access-layer/`.

## Quickstart

```sh
bun install
bun cli --help            # from repo root
# or, equivalently:
bun run cli --help        # from repo root or from apps/cli
```

There is no `bun link` / global install path. The CLI is invoked only through `bun cli` / `bun run cli`, both of which dispatch to `apps/cli/bin/ctxindex.mjs`.

## Documentation map

| Document | Owns |
|---|---|
| `SPEC.md` | Normative external behavior and the adapter/extension contract |
| `CONTEXT.md` | Domain language (Ref, Resource, Profile, Source, Extension, ...) |
| `IMPLEMENTATION.md` | Reference implementation choices (see supersession banner) |
| `V1.md` | Historical v1 milestone scope |
| `docs/design/2026-07-13-context-access-layer.md` | Access-layer redesign: decision log D1–D19, concept model, storage, open questions |
| `docs/design/architecture-explainer.md` / `.html` | Narrative architecture explainer |
| `openspec/` | Spec-driven change management (active: `v2-context-access-layer`) |
| `docs/AGENT-HOWTOS.md` | Agent recipes for driving the real CLI |
| `skills/` | Bundled agent-facing skill docs shipped with the CLI |
