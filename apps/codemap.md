# apps/

## Responsibility

Contains application-facing workspace packages: the public `ctxindex` CLI, the Next.js documentation/landing site, and the foreground local Bun daemon prototype.

## Design / patterns

- Separates the user-facing application boundary from reusable domain and provider packages under `packages/`.
- `apps/cli/` is the public unscoped Bun ESM `ctxindex` package; its executable shim delegates to a layered TypeScript CLI composition root, while its `build:package` script delegates distribution bundling to `scripts/release/build-cli-package.ts`, which incorporates private workspace code into the npm artifact.
- `apps/web/` is a private Next.js App Router workspace that compiles MDX with Fumadocs and exposes both human-readable pages and agent-readable Markdown/LLM representations.
- `apps/daemon/` is a private Bun ESM workspace that composes core services behind a local Unix-socket RPC boundary; it does not own core business rules, RPC contracts, or filesystem coordination primitives.

## Data & control flow

User argv enters `apps/cli/bin/ctxindex.mjs`, flows to `apps/cli/src/main.ts#runCli`, then through citty command descriptors, typed parsers, dependency composition, core service calls, and output/exit adapters. Trusted Git Catalog acquisition and manifest-owned explicit packages feed the common Extension entry/collection boundary while startup stays offline. Initialization selects a secret backend for a fresh config. OAuth onboarding follows explicit `oauth-app` -> `account --app` -> `source` layering; removed `client` and `auth` commands have no aliases. The application returns a numeric status to the executable shim.

For the web workspace, Fumadocs compiles `content/docs/` into the generated `collections/server` source. Next.js routes load that source to render the documentation tree, provide search, produce per-page Markdown and aggregate LLM text, and generate Open Graph images; content negotiation rewrites Markdown-preferring `/docs` requests to the page representation route.

The daemon foreground entry `apps/daemon/src/main.ts#main` derives ctxindex roots, calls `startDaemon()`, acquires retained lifecycle/database leases, loads persisted Extensions offline, composes core services, binds the Unix-socket RPC transport, publishes readiness, and drains/cleans up on shutdown.

## Integration points

- Registered by the root `package.json` workspace pattern `apps/*`; app-owned scripts participate in root Turbo dev/build/quality/cleanup commands, while root and package-local `cli` scripts share the marker-aware `scripts/cli.sh` launcher before invoking `apps/cli/bin/ctxindex.mjs`.
- `apps/cli/` consumes public seams from `packages/core`, `packages/adapters`, and `packages/extension-sdk` through their workspace package names.
- `apps/daemon/` consumes `@ctxindex/adapters`, `@ctxindex/core`, `@ctxindex/local-daemon`, `@ctxindex/rpc`, and `@orpc/server` without coupling RPC composition to business behavior.
- Detailed maps: `apps/cli/codemap.md`, `apps/daemon/codemap.md`, and `apps/web/codemap.md`.
