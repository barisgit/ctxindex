# ctxindex web product context

## Surface and audience

- Register: brand-led product landing page with long-form technical documentation.
- Platform: responsive web, rendered by the existing Next.js and Fumadocs app.
- Primary audience: developers and agent-workflow builders evaluating, using, or extending ctxindex.
- Core task: understand within ten seconds that ctxindex gives shell-capable agents one local typed interface over mail, calendars, files, and Extension-defined context, then reach a working local result quickly.

## Positioning and voice

ctxindex is a local personal-context gateway for agents. The CLI is the only agent integration surface; any shell-capable agent composes deterministic commands with machine-readable output and stable exit codes. Providers and files remain canonical while local materializations support search, retrieval, export, Relations, Artifacts, and narrowly typed Actions.

The voice is exact, quiet, and capable. Prefer concrete commands, results, and trust boundaries over marketing claims. Use canonical terms from `CONTEXT.md` consistently.

## Primary journeys

1. Install ctxindex, initialize local state, connect a providerless directory Source, and obtain a useful search result.
2. Connect Google or Microsoft through an available managed OAuth App or explicit local BYOA fallback without implying universal provider approval.
3. Give a shell-capable agent governed access through `ctxindex ... --json` commands.
4. Author a type-safe Extension with the same SDK used by built-in Extensions.
5. Find exact CLI and SDK reference only after the usage-oriented guidance.

## Calls to action

- Primary: install and reach the first local result.
- Secondary: read the Extension SDK guide.
- Supporting: open generated CLI reference or repository source.

## Visual and interaction constraints

- Follow root `DESIGN.md` and the existing `/design` specimen.
- Use the current semantic slate/neutral tokens, Inter for prose, JetBrains Mono for commands and data, and rare amber only for meaningful signal and action.
- Use real command/result artifacts. Do not add gradients, decorative imagery, terminal cosplay, generic knowledge graphs, or repeated marketing-card grids.
- Preserve keyboard-visible focus, 44px touch targets where plausible, reduced-motion behavior, readable line lengths, and intentional light/dark themes.

## Product boundaries

- The website stores no ctxindex user or provider state and operates no hosted Marketplace.
- Catalogs are optional local discovery inputs; direct Extension installation does not require a Catalog.
- External Extensions are trusted in-process code, not sandboxed plugins.
- Provider mutations stop at reversible email Draft create/update; ctxindex does not send email.
- Capability specs and `CONTEXT.md` remain authoritative. Website copy is a maintained projection.

## Explicitly avoid

- Claims that managed Google or Microsoft OAuth availability or verification is universal.
- OAuth App configuration, client ids, desktop-secret metadata, token data, or secret references in public inventory examples.
- Hand-maintained CLI command reference; generated reference owns that surface.
- Replacing Fumadocs or inventing a second design system without a demonstrated blocker.
