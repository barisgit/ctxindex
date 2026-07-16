# Repository Atlas: ctxindex

## Project responsibility

ctxindex is a local personal-context gateway that gives agents and users one interface for discovering, retrieving, locally materializing, and performing typed Actions on context whose canonical copies remain in external services or local files.

## Design / patterns

- Bun/Turborepo monorepo split into a user-facing application (`apps/`), reusable runtime and contract packages (`packages/`), external authoring examples (`examples/`), and repository tooling (`scripts/`).
- Layered boundaries keep CLI parsing and presentation separate from core application services, provider-neutral Profile contracts, and provider/filesystem Adapter I/O.
- Extensions bundle declarative Profiles and Source Adapters; core registries validate those definitions before service workflows dispatch operations and persist local state.

## Entry points

- `package.json` — workspace manifest and root commands; `bun cli` invokes the application, while `build`, `typecheck`, `test`, and `ci` compose repository gates.
- `apps/cli/bin/ctxindex.mjs` — executable shim that forwards argv to `apps/cli/src/main.ts#runCli` and assigns the returned exit code.
- `packages/core/src/index.ts` — primary core package export surface for domain services and runtime infrastructure.
- `packages/extension-sdk/src/index.ts` — public authoring/runtime contract for Profiles, Source Adapters, and Extensions.
- `packages/profiles/src/index.ts` and `packages/adapters/src/index.ts` — bundled definition and provider-integration export surfaces.

## Data & control flow

CLI argv enters `apps/cli/bin/ctxindex.mjs`, is parsed and dispatched by `apps/cli/src/`, and reaches services exported by `packages/core/`. Core loads Profile and Adapter definitions from the package registry, invokes provider operations through the Extension SDK contracts, validates emitted data, and coordinates search, retrieval, Actions, sync, and local persistence. Results return through CLI formatters to terminal output and a stable process status.

## Integration points

- Root orchestration: Bun workspaces and Turbo tasks declared in `package.json`.
- Local persistence/runtime: core storage, schema, configuration, secrets, logging, and network boundaries under `packages/core/src/`.
- External systems: provider and filesystem access implemented under `packages/adapters/src/`.
- Public extension boundary: `packages/extension-sdk/src/index.ts`, demonstrated by `examples/`.

## Directory map

| Directory | Responsibility | Detailed map |
| --- | --- | --- |
| `apps/` | Deployable application workspaces, currently the Bun-based `ctxindex` CLI. | [`apps/codemap.md`](apps/codemap.md) |
| `packages/` | Reusable core runtime, extension contract, provider-neutral Profiles, and built-in Adapters. | [`packages/codemap.md`](packages/codemap.md) |
| `examples/` | Self-contained external Extension examples using only the public authoring boundary. | [`examples/codemap.md`](examples/codemap.md) |
| `scripts/` | Repository policy gates, isolated implementation spikes, and bounded command tooling. | [`scripts/codemap.md`](scripts/codemap.md) |
