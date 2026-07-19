# Docs web surface implementation

## Module ownership

The private `web` workspace owns presentation, documentation content, metadata assembly, and generated documentation/search routes. It may project public package contracts and repository documentation, but it does not own ctxindex domain or CLI behavior. The CLI remains the only agent integration surface.

Repository verification owns workspace dependency policy. Applications may depend on public package workspaces, never sibling applications. Framework-specific import recognition stays centralized in the dependency verifier rather than becoming a whole-package bypass.

## Interfaces and data flow

The docs source loader is the single index of MDX pages and produces navigation, page lookup, generated Markdown paths, image paths, and search records. Representation route handlers validate their exact terminal filename before removing it and resolving the remaining page slug. Unknown pages and malformed paths terminate through the framework not-found boundary.

A shared origin resolver parses the deployment-provided canonical origin for root metadata and absolute social URLs. Origin-dependent metadata is absent when no public origin is configured. Repository configuration provides owner, repository, and branch; source links root page-relative MDX paths under the web workspace from the monorepo root.

Documentation examples project the generated CLI command tree and JSON contracts. They do not introduce wrappers, hosted APIs, or provider-specific command families.

The workspace dependency verifier discovers authored source extensions recursively while excluding dependency, build, framework-generated, and configured generated directories. It classifies Node/Bun built-ins, configured path aliases, narrowly recognized framework imports, and declared peers before comparing remaining external imports with runtime dependencies.

## Storage and trust

The web surface stores no user, provider, Catalog, or search state. MDX content and product images are repository assets. Framework output and visual-review captures are generated artifacts, not versioned product state.

The site accepts no credentials or provider data and creates no new ctxindex provider egress. External Extensions remain trusted in-process code; web content preserves both Catalog trust decisions and does not imply that a hosted service validates or sandboxes them.

## Verification

Focused tests cover canonical-origin and source-link construction, exact accepted and malformed representation suffixes, recognized framework imports, and an undeclared ordinary web import. CLI examples are audited against current help, Action schemas, and JSON e2e contracts. Web typecheck and production build verify generated routes and metadata integration. Cross-cutting gates remain repository CI and strict OpenSpec validation.
