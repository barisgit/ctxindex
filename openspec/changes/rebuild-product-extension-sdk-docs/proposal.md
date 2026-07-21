## Why

The public website does not yet communicate ctxindex's agent workflow within the first screen, and its documentation structure emphasizes a large handwritten CLI reference over successful onboarding, real usage, and Extension authoring. Third-party adoption also requires a complete, copyable, type-safe Extension SDK path that explains the accepted authoring graph, package layout, documentation sidecars, testing, and publication without making readers reconstruct the design from source and specifications.

## What Changes

- Rebuild the homepage around a concrete install-to-result agent workflow and direct onboarding path using established ctxindex visual doctrine and real product artifacts.
- Reorganize public documentation into Start, Use, Extend, Reference, and Contribute concerns.
- Add comprehensive Extension SDK guidance for Providers, Profiles, Source Adapters, OAuth Apps, Extensions, documentation trees, Catalogs, packaging, testing, installation, and publishing.
- Publish at least one complete provider-backed and one providerless Extension example whose source is typechecked or tested in the repository.
- Make generated CLI reference visually and structurally secondary to usage guidance instead of maintaining a parallel handwritten command contract.
- Add focused content, link, responsive, accessibility, and visual-verification coverage for the product and documentation surfaces.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `docs-web-surface`: Add product-first onboarding, task-oriented documentation information architecture, generated-reference separation, and representative accessibility and visual verification.
- `extension-documentation`: Document the public authoring and packaging contract comprehensively, including copyable tested provider-backed and providerless examples and passive documentation-tree assets.

## Impact

- Changes the private `apps/web` landing page, Fumadocs content tree, navigation metadata, and focused web/content verification.
- Adds or refines repository-owned Extension examples and their tests only where needed to make published examples copyable and mechanically verified.
- Preserves the current Extension runtime architecture, Fumadocs renderer, CLI-only agent boundary, local Marketplace model, provider/network boundaries, and persistent data contracts.
- Does not introduce a hosted marketplace, user state in the web app, a second CLI implementation, provider traffic, or new provider mutations.
