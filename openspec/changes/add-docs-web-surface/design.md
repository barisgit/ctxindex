## Context

The branch already contains a Next.js/Fumadocs landing and documentation app. Review exposed gaps at the boundary between generated routes, deployment metadata, repository verification, and prose copied from the CLI. The CLI and capability specs remain authoritative; the site is a maintained user-facing projection. The repository is pre-alpha, so correctness and a small honest deployment contract matter more than compatibility with draft URLs or prose.

## Goals / Non-Goals

**Goals:**

- Make public URLs and repository links correct in production and configurable across deployments.
- Reject malformed generated-content routes instead of resolving them by truncating an arbitrary final segment.
- Describe the actual Next.js server/serverless runtime required by the search route.
- Make documented commands and JSON shapes executable and reviewable against the current CLI.
- Apply the repository dependency gate to the web app without treating generated framework files or framework-provided modules as application dependencies.

**Non-Goals:**

- A hosted marketplace, extension installer service, or hosted search index.
- A fully static export or a replacement client-side search implementation.
- A new agent integration surface or changes to CLI behavior.
- Treating the site, its examples, or `SYSTEM.md` as normative product specifications.
- Preserving malformed draft routes or review-only screenshots.

## Decisions

1. **Keep the Next.js runtime honest.** The documentation corpus is prerendered, while the Fumadocs search endpoint remains a runtime route. Deployment guidance will require `next start`, standalone Next output, or a compatible serverless platform. Replacing search with a static client index would add scope without fixing the reviewed contract.
2. **Use one canonical-origin resolver.** Public metadata and generated absolute URLs derive from a configured deployment origin, normalized to a URL. Origin-dependent fields are omitted when it is absent. This avoids request-host-dependent metadata without inventing a public domain and supports preview/self-hosted deployments.
3. **Validate generated route suffixes explicitly.** Markdown representations accept only `content.md`; generated page images accept only `image.png`. The page slug is resolved only after that exact terminal segment is confirmed.
4. **Link to repository paths from the monorepo root.** View-source links include `apps/web/content/docs/` before the page path.
5. **Model verifier exceptions, not package exemptions.** Dependency discovery ignores generated directories, resolves configured TypeScript path aliases as local imports, and recognizes a narrow set of framework/type peer imports. Every ordinary external import in `web` still requires a declared runtime dependency, and fixtures prove violations are reported.
6. **Keep examples sourced from current behavior.** CLI pages and workflow guides use commands accepted by current help and output envelopes established by CLI tests. Git Catalog is documented as a merged local catalog with trust at catalog-add and install time, not as a hosted marketplace.

## Risks / Trade-offs

- Configured origins can be malformed. → Parse and normalize through `URL`, and fail the build early rather than emit invalid canonical metadata.
- Framework-generated imports can change across upgrades. → Keep exceptions narrow and cover both accepted framework imports and rejected ordinary imports with verifier fixtures.
- Documentation can drift after later CLI changes. → Audit all CLI pages in this change and keep representative links, suffix behavior, metadata, and dependency rules under automated coverage; future command changes remain responsible for updating their docs.
- Server-rendered search requires hosting capability beyond a file server. → State the server/serverless requirement explicitly and avoid claiming static hosting support.

## Migration Plan

No persistent user or provider state changes. Production deployments should set the documented canonical-origin environment variable before building. Previously published malformed representation URLs are intentionally unsupported. Review-only screenshots are removed from Git and remain recoverable from earlier branch commits.

## Open Questions

None.
