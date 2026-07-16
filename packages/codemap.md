# packages/

## Responsibility

Contains the reusable workspace libraries that define ctxindex's domain/runtime services, extension contract, provider-neutral Profiles, and built-in provider Adapters.

## Design/patterns

- Layered packages: `extension-sdk` defines contracts; `profiles` supplies declarative domain vocabularies; `adapters` performs provider/filesystem I/O; `core` validates definitions and owns application services, persistence, orchestration, configuration, security, and search.
- Package boundaries are explicit TypeScript export maps in each `packages/*/package.json`; the root `package.json` includes `packages/*` as Bun workspaces.
- Detailed maps: `packages/extension-sdk/codemap.md`, `packages/profiles/codemap.md`, `packages/adapters/codemap.md`. Core's completed subsystem maps live under `packages/core/src/*/codemap.md`.

## Data & control flow

1. Profiles and Adapters are authored against `@ctxindex/extension-sdk` and bundled as Extensions.
2. Core extension/registry services load and validate definitions, then source/search/sync/action services dispatch Adapter operations through SDK contexts.
3. Adapter outputs are validated against Profile schemas and flow through core resource, relation, artifact, export, thread, and search services into the Drizzle/Bun SQLite storage model.
4. Core configuration, paths, secrets, auth, network egress, logging, and migrations provide the runtime infrastructure around those workflows.

## Integration points

| Package | Integration role | Detailed map |
| --- | --- | --- |
| `packages/extension-sdk/` | Shared contracts for definitions, contexts, emissions, and operations. | `packages/extension-sdk/codemap.md` |
| `packages/profiles/` | Built-in `communication.message@1` and `file@1` vocabularies. | `packages/profiles/codemap.md` |
| `packages/adapters/` | Built-in Gmail and local-directory provider integrations. | `packages/adapters/codemap.md` |
| `packages/core/` | Application services, registries, SQLite storage/schema, sync/search/action pipelines, and runtime infrastructure exported by `packages/core/src/index.ts` and subpath exports. | `packages/core/src/*/codemap.md` |

- `apps/cli/` is the primary workspace consumer of core services and registered definitions; external extensions also consume the SDK.
- Third-party boundaries include Zod, Drizzle/Bun SQLite, Google OAuth/Gmail, Node filesystem/keychain APIs, and logging/parsing utilities declared by each package manifest.
