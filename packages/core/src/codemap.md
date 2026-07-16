# packages/core/src/

## Responsibility

Implements ctxindex's provider-neutral domain and application layer: extension registration, Realm/Source lifecycle, authenticated provider operations, Resource/Relation persistence, sync/search/retrieval, Actions, exports, Artifacts, threads, and shared runtime infrastructure.

## Design/patterns

- Capability folders expose canonical `index.ts` interfaces; the root barrel and package subpaths publish those seams without provider-specific business logic.
- Profiles and Adapters form the strategy/plugin boundary: registries validate definitions and OAuth declarations, Profiles own payload semantics, and Adapters own provider I/O and API-host authority. Built-in Google and Microsoft implementations enter only through composition.
- Factory-built services and repositories receive explicit database, registry, auth, and logger dependencies; SQLite schema/storage plus transactional sync remain the local system of record.
- Cross-cutting contracts are centralized in errors, exit codes, IDs, Refs, configuration, paths, logging, networking, and typed secret routing. `config/` centrally types Google/Microsoft credential and loopback test environment keys.

## Data & control flow

1. Configuration/paths resolve runtime state, secrets select and persist a backend, and storage bootstraps SQLite and migrations.
2. Extension loading builds registries; account/auth establish provider-neutral Account identities and Grants for provider declarations such as Google or Microsoft, while Realm/Source services establish ownership and Adapter coordinates.
3. Source sync validates Adapter emissions transactionally; search, retrieval, Artifact download, Actions, exports, and threads resolve registered definitions and invoke provider operations through constrained provider contexts.
4. Adapter results return as validated resources, relations, artifacts, warnings, checkpoints, or Action outputs; typed core errors map failures across module and process boundaries.

## Integration points

- Public surface: `packages/core/src/index.ts` and capability subpaths in `packages/core/package.json`.
- Definitions/contracts: `packages/extension-sdk/src/`, provider-neutral Profiles, and built-in Google, Microsoft, and filesystem Adapters under `packages/adapters/src/`.
- Application composition: `apps/cli/src/deps.ts`, command handlers, and sync runner.
- Detailed capability maps live in populated child `codemap.md` files, including auth, config, registry, source, search, sync, artifact, and persistence infrastructure.
