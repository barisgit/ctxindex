# apps/web/

## Responsibility

Implements the public ctxindex landing page and documentation site as a private Next.js App Router workspace. It serves human-oriented documentation together with deterministic search, Markdown, LLM-text, and Open Graph representations of the same MDX source.

## Design / patterns

- `content/docs/` is the authored documentation tree. Its primary navigation follows reader intent through `start/`, `use/`, `extend/`, `reference/`, and `contribute/`; the generated CLI subtree remains a secondary reference surface. `source.config.ts` declares the Fumadocs MDX schemas and enables processed Markdown for machine-readable representations.
- `lib/source.ts` is the Source Gateway over generated `collections/server` data. It centralizes page lookup, navigation-tree creation, static route parameters, Markdown rendering, and social-image paths.
- Route components under `app/` separate the marketing shell, documentation layout/page rendering, search endpoint, text representations, and generated image representations.
- `lib/shared.ts` owns stable route constants, canonical URL helpers, repository source links, and representation-slug parsing. `proxy.ts` applies content negotiation for Markdown-preferring documentation requests.
- Reusable presentation components live in `components/`; `app/global.css` owns the semantic OKLCH light/dark tokens, maps app-facing color aliases onto Fumadocs' dynamic `fd-*` integration variables, and Fumadocs' root provider applies theme state. The unlisted `/design` route renders an executable specimen from those same tokens and components so visual drift remains observable.
- The landing page pairs its product claim with one compact real command/result artifact and direct Start/Extend routes. It uses flat divider-led structures instead of repeated marketing-card grids or decorative imagery.
- `components/logo.tsx` renders the adaptive inline mark. `components/brand-lockup.tsx` renders the official outlined Geist wordmark lockups (horizontal and stacked, adaptive or monochrome) via `<use>` references into the canonical sprite that `components/brand-lockup-defs.tsx` inlines once per document from `public/brand/ctxindex-lockup-sprite.svg`. `public/brand/` contains distributable mark and lockup SVGs plus raster exports, presented on the public `/brand` page; root `DESIGN.md` owns project-wide visual doctrine.

## Data & control flow

1. `fumadocs-mdx` compiles `content/docs/**/*.mdx` and metadata into the generated `collections/server` module.
2. `lib/source.ts` wraps the generated collection with the Fumadocs loader and Lucide icon plugin.
3. `/docs/[[...slug]]` resolves a page through that source, renders its compiled MDX with shared components, and derives metadata and representation links.
4. `/api/search`, `/llms.txt`, `/llms-full.txt`, `/llms.mdx/docs/**`, and `/og/docs/**` read the same source to expose search data, aggregate or page-level text, and social images.
5. `proxy.ts` rewrites explicit `.md` paths and Markdown-negotiated `/docs` requests to the canonical per-page Markdown representation.
6. `/design` applies forced light and dark token scopes to representative typography, controls, code, and logo sizes without introducing a parallel theme implementation.
7. Focused homepage and content-contract tests enforce first-viewport claims, task-oriented navigation, checked Extension-example links, and authored internal-route resolution before MDX type generation and production build.

## Integration points

- Registered by the root `apps/*` Bun workspace; `apps/web/package.json` owns the Next dev/start/build, quality, and clean/fullclean tasks dispatched by root Turbo commands. `next.config.mjs` pins Turbopack discovery to the repository worktree root.
- Depends on Next.js and React for routing/rendering, Fumadocs packages for MDX compilation, source loading, documentation UI, search, and representations, and Tailwind/PostCSS for styling.
- Reads `NEXT_PUBLIC_SITE_URL` only to derive canonical absolute metadata URLs; source links target the repository's `apps/web/content/docs/` tree.
- Does not import ctxindex runtime packages; it documents the CLI contract rather than embedding a second agent integration surface.
