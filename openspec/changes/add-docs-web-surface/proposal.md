## Why

ctxindex needs a public landing page and reference site whose examples stay aligned with the CLI contract. The current branch introduces that surface, but it is not yet covered by a capability specification and several review findings show that its generated routes, metadata, source links, deployment description, dependency checks, and command examples can drift or mislead users.

## What Changes

- Add a maintained landing and documentation web surface for ctxindex.
- Publish canonical metadata and social URLs from a configurable public origin.
- Serve generated documentation representations only at exact documented route suffixes, with malformed variants returning not found.
- Link each rendered page to its actual repository source.
- Document the web app's real Next.js runtime and deployment requirements.
- Keep CLI and workflow examples executable against the current generated command surface, including Git Catalog marketplace behavior and reversible Draft reply/update inputs.
- Include the web workspace in repository dependency verification, accounting for framework-generated code and framework-managed imports without exempting the app from violations.

## Capabilities

### New Capabilities

- `docs-web-surface`: Public landing, documentation rendering, generated representations, canonical metadata, source links, deployment contract, and accuracy/verification expectations for the ctxindex web app.

### Modified Capabilities

None.

## Impact

- Adds and verifies the private `web` workspace under `apps/web`, built with Next.js and Fumadocs.
- Adds static documentation content derived from the current CLI and canonical product specifications; it does not make the web content or `SYSTEM.md` normative.
- Extends the repository dependency verifier and its fixtures so the web workspace follows the same declared-dependency and architecture checks as other workspaces.
- Requires a server or serverless Next.js deployment for the search route; it does not introduce a hosted marketplace, provider mutation, user data storage, or a new agent integration surface.
