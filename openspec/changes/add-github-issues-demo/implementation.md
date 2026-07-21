## Capability Implementation Targets

- `github-issues-demo` → `openspec/specs/github-issues-demo/implementation.md`

## Module Ownership

The example workspace package owns the GitHub Provider, issue Profile, repository Source configuration, request construction, response normalization, pagination validation, and sync operation. Its Extension entry is a plain composition root importing only `@ctxindex/extension-sdk`; it is neither built in nor privileged. Provider-neutral core continues to own transactional application, reconciliation, cursor durability, local search, and Ref retrieval.

## Interfaces and Data Flow

The stable public definitions are `github.public`, `github.issues`, `software.issue@1`, and the Extension root `ctxindex.github-issues-demo`. The Adapter accepts strict `{ owner, repository }` config and uses only the injected `fetch`, `signal`, `logger`, and `emit` operation context.

The sync implementation validates config and cursor, constructs the first canonical URL, fetches and validates the complete page graph into bounded normalized payloads, then emits complete Resources followed by one checkpoint. Pagination parsing remains a private package concern and returns only a validated canonical next URL. All errors cross the Adapter operation boundary as rejected sync promises; no provider-specific behavior enters core or CLI.

## Storage and State

Core owns all durable Resource, index, run, and cursor state. The Adapter cursor is a strict JSON object containing its version, sorted complete issue-number membership, completed page count, and an optional single-page ETag. Page bodies and raw provider objects remain ephemeral and are discarded after normalization.

## Security and Compatibility

The Provider uses `auth.none()` and the Adapter declares only `api.github.com` egress. URL validation is exact and does not permit redirects to become pagination authority. No credentials, actor/assignee identity data, scraping, provider mutation, retry loop, schema migration, or compatibility alias is introduced.

## Verification

Package tests exercise definition shape, package discovery, strict schemas, headers, normalization, all pagination and failure boundaries, conditional-request eligibility, and emission atomicity with injected mocks. A CLI end-to-end test loads a copied package, serves deterministic GitHub-shaped pages through a loopback fetch rewrite, and proves sync plus local search/get with limit and offset. Cross-cutting verification includes package dependency and module architecture gates, compiled external Extension coverage where applicable, TypeScript checks, strict OpenSpec validation, and repository CI when coordinated.

## Promotion Notes

Create `openspec/specs/github-issues-demo/implementation.md` with the ownership, stable definition identities, injected complete-page sync pipeline, core-owned durable state, strict cursor shape, exact egress boundary, privacy exclusions, and offline verification doctrine above before archive.
