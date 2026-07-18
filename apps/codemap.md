# apps/

## Responsibility

Contains deployable/application-facing workspace packages. The selected production tree currently consists of the `ctxindex` command-line application under `apps/cli/`.

## Design / patterns

- Separates the user-facing application boundary from reusable domain and provider packages under `packages/`.
- `apps/cli/` is a private Bun ESM workspace package whose executable shim delegates to a layered TypeScript CLI composition root.

## Data & control flow

User argv enters `apps/cli/bin/ctxindex.mjs`, flows to `apps/cli/src/main.ts#runCli`, then through citty command descriptors, typed parsers, dependency composition, core service calls, and output/exit adapters. Trusted Git Catalog add and refresh acquire immutable snapshots; list/show/install refresh by default but accept `--no-refresh`, while startup stays offline. Initialization selects and persists an available secret backend for a fresh config; the light `secrets` surface reports safe status or requests a crash-safe backend switch. OAuth onboarding follows the explicit `client` -> `account` -> `source` layering; the removed `auth` command has no alias. The application returns a numeric status to the executable shim.

## Integration points

- Registered by the root `package.json` workspace pattern `apps/*`; the root `cli` script invokes `apps/cli/bin/ctxindex.mjs`.
- `apps/cli/` consumes public seams from `packages/core`, `packages/adapters`, and `packages/extension-sdk` through their workspace package names.
- Detailed map: `apps/cli/codemap.md`.
