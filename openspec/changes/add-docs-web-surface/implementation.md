## Capability Implementation Targets

- `docs-web-surface` → `openspec/specs/docs-web-surface/implementation.md`

## Module Ownership

The private `web` workspace owns presentation, documentation content, metadata assembly, and generated documentation/search routes. It may consume public package contracts and repository documentation but does not own ctxindex domain or CLI behavior. The CLI remains the sole agent integration surface.

Repository verification under `scripts/verify` owns workspace dependency policy. Applications may depend on public `packages/*` workspaces, never sibling applications. Framework-specific import recognition is centralized in the verifier rather than encoded as a whole-package bypass.

## Interfaces and Data Flow

The docs source loader is the single index of MDX pages and produces navigation, page lookup, generated Markdown paths, image paths, and search records. Representation route handlers validate their exact terminal filename before removing it and resolving the remaining page slug. Unknown pages and malformed paths terminate through the framework's not-found boundary.

A shared canonical-origin resolver returns one normalized `URL` for root metadata and any absolute site URLs. Repository configuration provides owner, repository, and branch; the docs source path is rooted from the monorepo before appending a page-relative MDX path.

Documentation examples project the CLI's generated command tree and JSON output contracts. They do not introduce wrappers, hosted APIs, or provider-specific command families.

The workspace dependency verifier discovers authored source extensions recursively while excluding dependency, build, framework-generated, and configured generated directories. It classifies Node/Bun built-ins, local relative imports, configured path aliases, and narrowly enumerated framework/peer imports before comparing remaining external imports with runtime dependencies.

## Storage and State

The web surface stores no user, provider, catalog, or search state. MDX content and product images are repository assets. Framework build output and visual review captures are generated artifacts and are not versioned product state.

## Security and Compatibility

The site does not accept credentials or provider data and creates no new network egress from ctxindex. External extensions remain in-process trusted code; marketplace documentation must preserve both trust decisions and must not imply that a hosted service validates or sandboxes them.

The project is pre-alpha, so malformed draft representation URLs receive no compatibility alias. The public origin is deployment configuration, not request-controlled host input. URL parsing fails closed during build for invalid configuration.

## Verification

Focused route tests cover exact accepted and malformed suffixes; helper/component tests cover canonical-origin and source-link construction; web dependency fixtures cover both recognized framework imports and an undeclared ordinary web import. CLI examples are audited against current `--help`, Action schemas, and existing JSON e2e assertions. The web typecheck and production build prove generated route and metadata integration. Repository completion gates remain `bun run ci` and `bunx openspec validate --all --strict`.

## Promotion Notes

Before archive, create `openspec/specs/docs-web-surface/implementation.md` with the module ownership, source-loader/route flow, canonical-origin boundary, no-user-state constraint, verifier classification boundary, and verification doctrine above. Do not promote change-local rationale or file-by-file task details.
