# Repository Atlas: ctxindex

## Project responsibility

ctxindex is a local personal-context gateway that gives agents and users one interface for discovering, retrieving, locally materializing, and performing typed Actions on context whose canonical copies remain in external services or local files.

## Design / patterns

- Bun/Turborepo monorepo split into user-facing application workspaces (`apps/`), reusable runtime and contract packages (`packages/`), external authoring examples (`examples/`), and repository tooling (`scripts/`).
- Layered boundaries keep CLI presentation separate from provider-neutral core services and Profiles: calendar and communication Profiles own shared vocabulary and Draft Action contracts, while Adapters own provider-specific Google, Microsoft Graph, and filesystem I/O.
- Extensions are versionless plain roots composing exact imported Providers, Profiles, Adapters, and OAuth Apps without a runtime dependency graph. Core resolves manifest-owned entries, collects exported roots/reachable leaves, and validates one complete registry atomically for built-in, explicit, and Catalog origins.
- Extension or secret-backed local OAuth Apps provide validated configuration. Authorization snapshots the exact selected App config into one private stable Grant per Account so refresh is independent of current App inventory.

## Entry points

- `package.json` — workspace manifest for `apps/*`, `packages/*`, and package-managed `examples/*`, plus the root command surface.
- `.github/workflows/ci.yml` — least-privilege pull-request CI that runs the repository gate with the pinned Bun version.
- `.agents/skills/repo-development/SKILL.md` — triggered contributor doctrine, CLI workflow, and verification guidance.
- `DESIGN.md` — project-wide visual doctrine for the adaptive ctxindex mark, semantic color roles, typography, component treatment, motion, and accessibility; the web app supplies its executable specimen.
- `apps/cli/bin/ctxindex.mjs` — executable shim forwarding argv to `runCli` and assigning its exit code.
- `apps/web/app/(home)/page.tsx`, `apps/web/app/(home)/design/page.tsx`, and `apps/web/app/docs/[[...slug]]/page.tsx` — Next.js landing page, live visual-system specimen, and Fumadocs-backed documentation routes.
- `packages/core/src/index.ts` — core domain services and runtime infrastructure export surface.
- `packages/extension-sdk/src/index.ts` — public Profile, Adapter, Extension, OAuth, and operation contracts.
- `packages/profiles/src/index.ts` and `packages/adapters/src/index.ts` — built-in semantic definitions and Google/Microsoft/filesystem integrations.

## Data & control flow

CLI input is parsed and dispatched by `apps/cli/` into core services. The access lifecycle is explicit: `oauth-app` imports safe Provider-declared App config, `account --app` performs consent and owns one stable private Grant snapshot, and `source` binds a labeled stream to that Grant and a Realm by Adapter id. Providerless Sources bypass Account, Grant, token, and Provider egress resolution. Core constrains provider contexts, validates outputs, and coordinates search, retrieval, Artifacts, Actions, sync, persistence, and typed secrets. Gmail and Microsoft Outlook Adapters implement reversible Draft create/update without send; Google and Microsoft Calendar Adapters share the ordinary calendar Profile; local-directory remains providerless. Independently, `apps/web/` serves the documentation site.

## Integration points

- Root orchestration: Bun workspaces and Turbo tasks in `package.json`; repository gates enforce dependency and architecture boundaries.
- Runtime: core storage, schema, configuration, secrets, logging, networking, auth, and operation services under `packages/core/src/`.
- External systems: Google OAuth/Gmail/Calendar, Microsoft OAuth/Graph Calendar and Outlook mailbox, and filesystem access under `packages/adapters/src/`.
- Public extension boundary: `packages/extension-sdk/src/index.ts`, demonstrated by manifest-discoverable package `examples/tenders-extension/`.

## Directory map

| Directory | Responsibility | Detailed map |
| --- | --- | --- |
| `.github/` | GitHub pull-request automation for the repository CI gate. | Workflow-local configuration. |
| `apps/` | Deployable application workspaces: the Bun-based `ctxindex` CLI and the Next.js/Fumadocs documentation site. | [`apps/codemap.md`](apps/codemap.md) |
| `packages/` | Core runtime, extension contract, provider-neutral Profiles, and built-in Google/Microsoft/filesystem Adapters. | [`packages/codemap.md`](packages/codemap.md) |
| `examples/` | External Extension examples using only the public authoring boundary. | [`examples/codemap.md`](examples/codemap.md) |
| `scripts/` | Repository policy gates, helper-created worktree isolation, and bounded command tooling. | [`scripts/codemap.md`](scripts/codemap.md) |
