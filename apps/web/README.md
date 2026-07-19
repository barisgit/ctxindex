# ctxindex web

Docs and landing site for ctxindex, built with Next.js 16 + Fumadocs. The site documents the local Git Catalog and other ctxindex workflows; it does not operate a hosted marketplace.

## Development

```sh
bun install
cd apps/web
bun run dev
```

- `bun run build` — production build; documentation pages are prerendered, while search remains a runtime route
- `bun run typecheck` — MDX regen + route typegen + tsc
- Lint is covered by the repo-root `biome check .`

## Structure

- `app/(home)/` — landing page
- `app/docs/` — Fumadocs docs renderer
- `content/docs/` — MDX content (getting started, concepts, CLI reference, guides, examples)
- `components/` — logo, terminal mockup, footer, MDX component registry
- `../web-assets/` — source logo assets (generated); `public/` holds the wired copies

## Deployment

Documentation pages are prerendered, but `/api/search` is a Next.js runtime route. Deploy with `next build && next start` or a compatible serverless platform such as Vercel. Container deployments can enable Next.js `output: 'standalone'` before building. A static file host is not sufficient because it cannot serve search.

Set `NEXT_PUBLIC_SITE_URL` to the deployment's absolute canonical origin before a production build. When it is absent, the app omits origin-dependent social image metadata instead of publishing a local or request-derived URL. A malformed non-empty value fails the build rather than emitting invalid public URLs.

The web app stores no user, provider, Catalog, or search state. Catalog discovery and installation happen locally through the ctxindex CLI; this site is documentation, not a hosted marketplace.
