# apps/

## Responsibility

Contains deployable application-facing workspace packages: the `ctxindex` command-line application under `apps/cli/` and the public documentation/landing site under `apps/web/`.

## Design / patterns

- Separates the user-facing application boundary from reusable domain and provider packages under `packages/`.
- `apps/cli/` is a private Bun ESM workspace package whose executable shim delegates to a layered TypeScript CLI composition root.
- `apps/web/` is a private Next.js App Router workspace that compiles MDX with Fumadocs and exposes both human-readable pages and agent-readable Markdown/LLM representations.

## Data & control flow

User argv enters `apps/cli/bin/ctxindex.mjs`, flows to `apps/cli/src/main.ts#runCli`, then through citty command descriptors, typed parsers, dependency composition, core service calls, and output/exit adapters. Trusted Git Catalog acquisition and manifest-owned explicit packages feed the common Extension entry/collection boundary while startup stays offline. Initialization selects a secret backend for a fresh config. OAuth onboarding follows explicit `oauth-app` -> `account --app` -> `source` layering; removed `client` and `auth` commands have no aliases. The application returns a numeric status to the executable shim.

For the web workspace, Fumadocs compiles `content/docs/` into the generated `collections/server` source. Next.js routes load that source to render the documentation tree, provide search, produce per-page Markdown and aggregate LLM text, and generate Open Graph images; content negotiation rewrites Markdown-preferring `/docs` requests to the page representation route.

## Integration points

- Registered by the root `package.json` workspace pattern `apps/*`; app-owned scripts participate in root Turbo dev/build/quality/cleanup commands, while root and package-local `cli` scripts share the marker-aware `scripts/cli.sh` launcher before invoking `apps/cli/bin/ctxindex.mjs`.
- `apps/cli/` consumes public seams from `packages/core`, `packages/adapters`, and `packages/extension-sdk` through their workspace package names.
- Detailed maps: `apps/cli/codemap.md` and `apps/web/codemap.md`.
