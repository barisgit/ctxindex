# Repository Atlas: ctxindex

## Project responsibility

ctxindex is a local personal-context gateway that gives agents and users one interface for discovering, retrieving, locally materializing, and performing typed Actions on context whose canonical copies remain in external services or local files.

## Design / patterns

- Bun/Turborepo monorepo split into a user-facing application (`apps/`), reusable runtime and contract packages (`packages/`), external authoring examples (`examples/`), and repository tooling (`scripts/`).
- Layered boundaries keep CLI presentation separate from provider-neutral core services and Profiles: calendar and communication Profiles own shared vocabulary and Draft Action contracts, while Adapters own provider-specific Google, Microsoft Graph, and filesystem I/O.
- Extensions bundle declarative Profiles and Source Adapters; core registries validate definitions and OAuth provider declarations before workflows dispatch operations and persist local state. Explicitly trusted Git Catalogs add commit-pinned inline Extension provenance with default command-time discovery refresh, explicit offline stored-snapshot reads, and offline startup, without a background marketplace or daemon.
- OAuth client records persist credential values through typed secret references, Accounts own one stable updatable Grant, and central typed environment capture keeps OAuth client credentials limited to explicit client-import and test-routing boundaries.

## Entry points

- `package.json` — workspace manifest and root commands; its `cli` script and the package-local CLI script share `scripts/cli.sh` so supported invocations automatically isolate state in helper-created worktrees, while build/typecheck/test/CI compose repository gates.
- `.github/workflows/ci.yml` — least-privilege pull-request CI that runs the repository gate with the pinned Bun version.
- `.agents/skills/repo-development/SKILL.md` — triggered contributor doctrine, CLI workflow, and verification guidance.
- `apps/cli/bin/ctxindex.mjs` — executable shim forwarding argv to `runCli` and assigning its exit code.
- `packages/core/src/index.ts` — core domain services and runtime infrastructure export surface.
- `packages/extension-sdk/src/index.ts` — public Profile, Adapter, Extension, OAuth, and operation contracts.
- `packages/profiles/src/index.ts` and `packages/adapters/src/index.ts` — built-in semantic definitions and Google/Microsoft/filesystem integrations.

## Data & control flow

CLI input is parsed and dispatched by `apps/cli/` into core services. The access lifecycle is explicit: `client` persists provider-scoped OAuth client configuration, `account` performs consent and owns one stable Grant, and `source` binds a labeled stream to that Grant and a Realm. Core loads Profile, Adapter, and OAuth declarations, constrains provider contexts, validates outputs, and coordinates search, retrieval, Artifacts, Actions, sync, persistence, and typed secrets. Concurrent remote-search cache writers are serialized by atomic SQLite Resource batches; optional cache exhaustion becomes a safe warning without discarding provider hits. Gmail and Microsoft Graph Outlook Adapters implement the shared reversible Draft create/update Actions with standalone and provider-native threaded-reply branches. Reply mutations resolve complete same-Source parent and Draft state locally, preserve immutable reply context, perform one no-retry provider mutation, and return a canonical materialized Draft Resource; sending remains outside the Action surface. Indexed Google and Microsoft Calendar Adapters synchronize provider events into the shared calendar Profile, while provider-root Graph transport serves both Microsoft calendar and mailbox modules. Google APIs, Microsoft Graph, or the local filesystem remain behind Adapter operation contracts; results return through CLI formatters with stable process statuses.

## Integration points

- Root orchestration: Bun workspaces and Turbo tasks in `package.json`; repository gates enforce dependency and architecture boundaries.
- Runtime: core storage, schema, configuration, secrets, logging, networking, auth, and operation services under `packages/core/src/`.
- External systems: Google OAuth/Gmail/Calendar, Microsoft OAuth/Graph Calendar and Outlook mailbox, and filesystem access under `packages/adapters/src/`.
- Public extension boundary: `packages/extension-sdk/src/index.ts`, demonstrated by `examples/`.

## Directory map

| Directory | Responsibility | Detailed map |
| --- | --- | --- |
| `.github/` | GitHub pull-request automation for the repository CI gate. | Workflow-local configuration. |
| `apps/` | Deployable application workspaces, currently the Bun-based `ctxindex` CLI. | [`apps/codemap.md`](apps/codemap.md) |
| `packages/` | Core runtime, extension contract, provider-neutral Profiles, and built-in Google/Microsoft/filesystem Adapters. | [`packages/codemap.md`](packages/codemap.md) |
| `examples/` | External Extension examples using only the public authoring boundary. | [`examples/codemap.md`](examples/codemap.md) |
| `scripts/` | Repository policy gates, helper-created worktree isolation, and bounded command tooling. | [`scripts/codemap.md`](scripts/codemap.md) |
